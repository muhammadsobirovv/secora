import { Injectable } from '@nestjs/common';
import type { IntegrationAdapter } from '../integration-adapter.interface.js';
import { IntegrationActionError } from '../integration-adapter.interface.js';

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

/// v1 scope: create a page under a parent database or page. Auth: a
/// Notion internal integration token (or OAuth access token — same
/// Bearer shape), sent as `Authorization: Bearer <token>` plus the
/// required `Notion-Version` header pinned to a stable API date.
@Injectable()
export class NotionAdapter implements IntegrationAdapter {
  readonly provider = 'NOTION' as const;
  readonly actions = ['createPage', 'listUsers'];

  private headers(credentials: string): Record<string, string> {
    return {
      Authorization: `Bearer ${credentials}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
  }

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson('https://api.notion.com/v1/users/me', { headers: this.headers(credentials) });
    if (status !== 200) return { ok: false, message: `Notion responded ${status}: ${JSON.stringify(body)}` };
    const name = (body as { name?: string }).name ?? 'unknown';
    return { ok: true, message: `Connected as ${name}` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const headers = this.headers(credentials);
    if (action === 'createPage') {
      const { parentDatabaseId, parentPageId, title, contentMarkdownParagraphs } = payload as {
        parentDatabaseId?: string;
        parentPageId?: string;
        title: string;
        contentMarkdownParagraphs?: string[];
      };
      const parent = parentDatabaseId ? { database_id: parentDatabaseId } : { page_id: parentPageId };
      const properties = parentDatabaseId
        ? { Name: { title: [{ text: { content: title } }] } }
        : { title: { title: [{ text: { content: title } }] } };
      const children = (contentMarkdownParagraphs ?? []).map((text) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
      }));
      const { status, body } = await fetchJson('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ parent, properties, children }),
      });
      if (status >= 300) throw new IntegrationActionError(`Notion createPage failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    if (action === 'listUsers') {
      const { status, body } = await fetchJson('https://api.notion.com/v1/users', { headers });
      if (status >= 300) throw new IntegrationActionError(`Notion listUsers failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    throw new IntegrationActionError(`Unsupported Notion action: ${action}`);
  }
}

/// v1 scope: create/append a note file via the community "Local REST
/// API" Obsidian plugin (obsidian-local-rest-api), the de-facto standard
/// way to reach an Obsidian vault programmatically since Obsidian has no
/// first-party cloud API. `config.baseUrl` points at the plugin's local
/// HTTPS endpoint (default `https://127.0.0.1:27124`); `credentials`
/// holds the plugin's generated API key, sent as `Authorization: Bearer
/// <key>`. Disclosed limitation: this requires the user to have that
/// plugin installed and the desktop Obsidian app running and reachable
/// from wherever the API server executes — for a cloud-hosted PentestHub
/// AI deployment that means reachable via the user's Desktop Agent /
/// local network, not the public internet. Documented in the module's
/// README as an operator/end-user setup requirement, not a bug.
@Injectable()
export class ObsidianAdapter implements IntegrationAdapter {
  readonly provider = 'OBSIDIAN' as const;
  readonly actions = ['createNote', 'appendToNote'];

  private baseUrl(config: Record<string, unknown> | null): string {
    return (config?.baseUrl as string | undefined) ?? 'https://127.0.0.1:27124';
  }

  async testConnection(credentials: string, config: Record<string, unknown> | null): Promise<{ ok: boolean; message: string }> {
    try {
      const { status, body } = await fetchJson(`${this.baseUrl(config)}/`, { headers: { Authorization: `Bearer ${credentials}` } });
      if (status !== 200) return { ok: false, message: `Obsidian Local REST API responded ${status}: ${JSON.stringify(body)}` };
      return { ok: true, message: 'Connected to local Obsidian vault' };
    } catch (error) {
      return { ok: false, message: `Obsidian vault unreachable (is the Local REST API plugin running?): ${(error as Error).message}` };
    }
  }

  async execute(action: string, credentials: string, config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const headers = { Authorization: `Bearer ${credentials}`, 'Content-Type': 'text/markdown' };
    const { path, content } = payload as { path: string; content: string };
    if (action === 'createNote') {
      const response = await fetch(`${this.baseUrl(config)}/vault/${encodeURIComponent(path)}`, { method: 'PUT', headers, body: content });
      if (response.status >= 300) throw new IntegrationActionError(`Obsidian createNote failed (${response.status})`);
      return { path, status: response.status };
    }
    if (action === 'appendToNote') {
      const response = await fetch(`${this.baseUrl(config)}/vault/${encodeURIComponent(path)}`, { method: 'POST', headers, body: content });
      if (response.status >= 300) throw new IntegrationActionError(`Obsidian appendToNote failed (${response.status})`);
      return { path, status: response.status };
    }
    throw new IntegrationActionError(`Unsupported Obsidian action: ${action}`);
  }
}

/// v1 scope: upload a file (e.g. a generated bug report) into a Drive
/// folder, and list files. Auth: an OAuth2 access token (obtained via the
/// standard OAuth exchange flow — see oauth-exchange.util.ts), sent as
/// `Authorization: Bearer <token>`. Upload uses the `multipart/related`
/// simple-upload variant of Drive API v3 so both metadata and content go
/// in a single request without a resumable-upload session.
@Injectable()
export class GoogleDriveAdapter implements IntegrationAdapter {
  readonly provider = 'GOOGLE_DRIVE' as const;
  readonly actions = ['uploadFile', 'listFiles'];

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${credentials}` },
    });
    if (status !== 200) return { ok: false, message: `Google Drive responded ${status}: ${JSON.stringify(body)}` };
    const email = (body as { user?: { emailAddress?: string } }).user?.emailAddress ?? 'unknown';
    return { ok: true, message: `Connected as ${email}` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    if (action === 'uploadFile') {
      const { name, mimeType, contentBase64, parentFolderId } = payload as {
        name: string;
        mimeType: string;
        contentBase64: string;
        parentFolderId?: string;
      };
      const boundary = `pentesthub-${Date.now()}`;
      const metadata = JSON.stringify({ name, parents: parentFolderId ? [parentFolderId] : undefined });
      const multipartBody =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${contentBase64}\r\n` +
        `--${boundary}--`;
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${credentials}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartBody,
      });
      const body: unknown = await response.json();
      if (response.status >= 300) throw new IntegrationActionError(`Google Drive uploadFile failed (${response.status}): ${JSON.stringify(body)}`);
      return body;
    }
    if (action === 'listFiles') {
      const { status, body } = await fetchJson('https://www.googleapis.com/drive/v3/files?pageSize=50', {
        headers: { Authorization: `Bearer ${credentials}` },
      });
      if (status >= 300) throw new IntegrationActionError(`Google Drive listFiles failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    throw new IntegrationActionError(`Unsupported Google Drive action: ${action}`);
  }
}

/// v1 scope: upload a file to a Dropbox path. Auth: an OAuth2 access
/// token sent as `Authorization: Bearer <token>`. Dropbox's content
/// upload API (`content.dropboxapi.com`) takes raw bytes with call
/// arguments in a JSON-encoded `Dropbox-API-Arg` header rather than the
/// request body, distinct from its metadata API
/// (`api.dropboxapi.com`) used for listing.
@Injectable()
export class DropboxAdapter implements IntegrationAdapter {
  readonly provider = 'DROPBOX' as const;
  readonly actions = ['uploadFile', 'listFolder'];

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials}` },
    });
    if (status !== 200) return { ok: false, message: `Dropbox responded ${status}: ${JSON.stringify(body)}` };
    const name = (body as { name?: { display_name?: string } }).name?.display_name ?? 'unknown';
    return { ok: true, message: `Connected as ${name}` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    if (action === 'uploadFile') {
      const { path, contentBase64 } = payload as { path: string; contentBase64: string };
      const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: true, mute: false }),
        },
        body: Buffer.from(contentBase64, 'base64'),
      });
      const body: unknown = await response.json();
      if (response.status >= 300) throw new IntegrationActionError(`Dropbox uploadFile failed (${response.status}): ${JSON.stringify(body)}`);
      return body;
    }
    if (action === 'listFolder') {
      const { path } = payload as { path: string };
      const { status, body } = await fetchJson('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: { Authorization: `Bearer ${credentials}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (status >= 300) throw new IntegrationActionError(`Dropbox listFolder failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    throw new IntegrationActionError(`Unsupported Dropbox action: ${action}`);
  }
}

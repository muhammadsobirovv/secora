import { Injectable } from '@nestjs/common';
import type { IntegrationAdapter } from '../integration-adapter.interface.js';
import { IntegrationActionError } from '../integration-adapter.interface.js';

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

/// v1 scope: create an issue, list repos the token can see. Auth: a
/// classic or fine-grained Personal Access Token (`token` credential),
/// sent as `Authorization: Bearer <token>` (GitHub also accepts `token`
/// scheme; `Bearer` works for both classic and fine-grained PATs and for
/// OAuth app tokens, so one code path covers PAT-connect and the OAuth
/// flow alike).
@Injectable()
export class GithubAdapter implements IntegrationAdapter {
  readonly provider = 'GITHUB' as const;
  readonly actions = ['createIssue', 'listRepos'];

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${credentials}`, 'User-Agent': 'PentestHub-AI', Accept: 'application/vnd.github+json' },
    });
    if (status !== 200) return { ok: false, message: `GitHub responded ${status}: ${JSON.stringify(body)}` };
    const login = (body as { login?: string }).login ?? 'unknown';
    return { ok: true, message: `Connected as ${login}` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const headers = { Authorization: `Bearer ${credentials}`, 'User-Agent': 'PentestHub-AI', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
    if (action === 'createIssue') {
      const { owner, repo, title, body: issueBody } = payload as { owner: string; repo: string; title: string; body?: string };
      const { status, body } = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, body: issueBody }),
      });
      if (status >= 300) throw new IntegrationActionError(`GitHub createIssue failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    if (action === 'listRepos') {
      const { status, body } = await fetchJson('https://api.github.com/user/repos?per_page=50', { headers });
      if (status >= 300) throw new IntegrationActionError(`GitHub listRepos failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    throw new IntegrationActionError(`Unsupported GitHub action: ${action}`);
  }
}

/// v1 scope: create an issue on a GitLab project (gitlab.com or a
/// self-managed instance via `config.baseUrl`). Auth: a project/personal
/// access token OR an OAuth2 access token — both sent as
/// `Authorization: Bearer <token>`. GitLab's REST API accepts PATs via
/// either the legacy `PRIVATE-TOKEN` header or the OAuth-compliant
/// `Authorization: Bearer` header (per GitLab's own docs); using `Bearer`
/// uniformly here means this one adapter serves both the token-connect
/// path and the OAuth-connect path (oauth-exchange.util.ts) without a
/// credential-shape branch.
@Injectable()
export class GitlabAdapter implements IntegrationAdapter {
  readonly provider = 'GITLAB' as const;
  readonly actions = ['createIssue', 'listProjects'];

  private baseUrl(config: Record<string, unknown> | null): string {
    return (config?.baseUrl as string | undefined) ?? 'https://gitlab.com';
  }

  async testConnection(credentials: string, config: Record<string, unknown> | null): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson(`${this.baseUrl(config)}/api/v4/user`, { headers: { Authorization: `Bearer ${credentials}` } });
    if (status !== 200) return { ok: false, message: `GitLab responded ${status}: ${JSON.stringify(body)}` };
    const username = (body as { username?: string }).username ?? 'unknown';
    return { ok: true, message: `Connected as ${username}` };
  }

  async execute(action: string, credentials: string, config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const headers = { Authorization: `Bearer ${credentials}`, 'Content-Type': 'application/json' };
    if (action === 'createIssue') {
      const { projectId, title, description } = payload as { projectId: string; title: string; description?: string };
      const { status, body } = await fetchJson(
        `${this.baseUrl(config)}/api/v4/projects/${encodeURIComponent(projectId)}/issues`,
        { method: 'POST', headers, body: JSON.stringify({ title, description }) },
      );
      if (status >= 300) throw new IntegrationActionError(`GitLab createIssue failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    if (action === 'listProjects') {
      const { status, body } = await fetchJson(`${this.baseUrl(config)}/api/v4/projects?membership=true&per_page=50`, { headers });
      if (status >= 300) throw new IntegrationActionError(`GitLab listProjects failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    throw new IntegrationActionError(`Unsupported GitLab action: ${action}`);
  }
}

/// v1 scope: create an issue on a Jira Cloud project. Auth: Basic auth
/// with `config.email` + an API token as `credentials` — Jira Cloud's REST
/// API doesn't accept a bare Bearer PAT for Basic-auth-shaped endpoints,
/// so this is the one adapter that builds an `Authorization: Basic`
/// header instead of `Bearer`.
@Injectable()
export class JiraAdapter implements IntegrationAdapter {
  readonly provider = 'JIRA' as const;
  readonly actions = ['createIssue'];

  private authHeader(credentials: string, config: Record<string, unknown> | null): string {
    const email = (config?.email as string | undefined) ?? '';
    return `Basic ${Buffer.from(`${email}:${credentials}`).toString('base64')}`;
  }

  private siteUrl(config: Record<string, unknown> | null): string {
    const site = (config?.site as string | undefined) ?? '';
    return `https://${site}.atlassian.net`;
  }

  async testConnection(credentials: string, config: Record<string, unknown> | null): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await fetchJson(`${this.siteUrl(config)}/rest/api/3/myself`, {
      headers: { Authorization: this.authHeader(credentials, config) },
    });
    if (status !== 200) return { ok: false, message: `Jira responded ${status}: ${JSON.stringify(body)}` };
    const displayName = (body as { displayName?: string }).displayName ?? 'unknown';
    return { ok: true, message: `Connected as ${displayName}` };
  }

  async execute(action: string, credentials: string, config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    if (action !== 'createIssue') throw new IntegrationActionError(`Unsupported Jira action: ${action}`);
    const { projectKey, summary, description, issueType } = payload as {
      projectKey: string;
      summary: string;
      description?: string;
      issueType?: string;
    };
    const { status, body } = await fetchJson(`${this.siteUrl(config)}/rest/api/3/issue`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(credentials, config), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType ?? 'Task' },
          description: description
            ? { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] }
            : undefined,
        },
      }),
    });
    if (status >= 300) throw new IntegrationActionError(`Jira createIssue failed (${status}): ${JSON.stringify(body)}`);
    return body;
  }
}

/// v1 scope: create an issue via Linear's GraphQL API. Auth: a personal
/// API key, sent as a raw `Authorization` header (Linear does not use the
/// `Bearer` scheme for personal API keys).
@Injectable()
export class LinearAdapter implements IntegrationAdapter {
  readonly provider = 'LINEAR' as const;
  readonly actions = ['createIssue'];

  private async graphql(credentials: string, query: string, variables: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
    return fetchJson('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: credentials, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  }

  async testConnection(credentials: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await this.graphql(credentials, 'query { viewer { name } }', {});
    if (status !== 200) return { ok: false, message: `Linear responded ${status}: ${JSON.stringify(body)}` };
    const name = ((body as { data?: { viewer?: { name?: string } } }).data?.viewer?.name) ?? 'unknown';
    return { ok: true, message: `Connected as ${name}` };
  }

  async execute(action: string, credentials: string, _config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    if (action !== 'createIssue') throw new IntegrationActionError(`Unsupported Linear action: ${action}`);
    const { teamId, title, description } = payload as { teamId: string; title: string; description?: string };
    const mutation = `mutation($teamId: String!, $title: String!, $description: String) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description }) { success issue { id identifier url } }
    }`;
    const { status, body } = await this.graphql(credentials, mutation, { teamId, title, description });
    if (status >= 300) throw new IntegrationActionError(`Linear createIssue failed (${status}): ${JSON.stringify(body)}`);
    return body;
  }
}

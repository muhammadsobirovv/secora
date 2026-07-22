import { Injectable } from '@nestjs/common';
import type { IntegrationAdapter } from '../integration-adapter.interface.js';
import { IntegrationActionError } from '../integration-adapter.interface.js';
import { signAwsRequest } from '../aws-sigv4.util.js';

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

/// v1 scope: representative single-service coverage rather than a
/// full-platform SDK — S3 put/list object, the most common "export a bug
/// bounty report / evidence archive to the customer's own cloud storage"
/// need. Auth: an IAM access key pair (`credentials` is
/// `"<accessKeyId>:<secretAccessKey>[:<sessionToken>]"`, colon-joined so
/// a single encrypted string covers both static keys and temporary STS
/// credentials), signed per-request with hand-rolled SigV4
/// (`aws-sigv4.util.ts`). `config.region` and `config.bucket` are
/// required; `config.endpoint` may override the default
/// `s3.<region>.amazonaws.com` host for S3-compatible stores.
@Injectable()
export class AwsAdapter implements IntegrationAdapter {
  readonly provider = 'AWS' as const;
  readonly actions = ['putObject', 'listObjects'];

  private parseCredentials(credentials: string): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } {
    const [accessKeyId, secretAccessKey, sessionToken] = credentials.split(':');
    if (!accessKeyId || !secretAccessKey) throw new IntegrationActionError('AWS credentials must be "accessKeyId:secretAccessKey[:sessionToken]"');
    return { accessKeyId, secretAccessKey, sessionToken };
  }

  private host(config: Record<string, unknown> | null): { region: string; bucket: string; host: string } {
    const region = (config?.region as string | undefined) ?? 'us-east-1';
    const bucket = config?.bucket as string | undefined;
    if (!bucket) throw new IntegrationActionError('AWS integration config.bucket is required');
    const host = (config?.endpoint as string | undefined) ?? `${bucket}.s3.${region}.amazonaws.com`;
    return { region, bucket, host };
  }

  async testConnection(credentials: string, config: Record<string, unknown> | null): Promise<{ ok: boolean; message: string }> {
    try {
      const creds = this.parseCredentials(credentials);
      const { region, bucket, host } = this.host(config);
      const url = new URL(`https://${host}/?list-type=2&max-keys=1`);
      const signed = signAwsRequest({ method: 'GET', url, region, service: 's3', headers: {}, body: Buffer.alloc(0), credentials: creds });
      const response = await fetch(url, { method: 'GET', headers: signed });
      if (response.status >= 300) return { ok: false, message: `S3 ListObjectsV2 responded ${response.status}: ${await response.text()}` };
      return { ok: true, message: `Connected to S3 bucket ${bucket} (${region})` };
    } catch (error) {
      return { ok: false, message: `AWS S3 connection failed: ${(error as Error).message}` };
    }
  }

  async execute(action: string, credentials: string, config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const creds = this.parseCredentials(credentials);
    const { region, host } = this.host(config);
    if (action === 'putObject') {
      const { key, contentBase64, contentType } = payload as { key: string; contentBase64: string; contentType?: string };
      const body = Buffer.from(contentBase64, 'base64');
      const url = new URL(`https://${host}/${key.replace(/^\//, '')}`);
      const headers = { 'content-type': contentType ?? 'application/octet-stream' };
      const signed = signAwsRequest({ method: 'PUT', url, region, service: 's3', headers, body, credentials: creds });
      const response = await fetch(url, { method: 'PUT', headers: { ...headers, ...signed }, body });
      if (response.status >= 300) throw new IntegrationActionError(`S3 PutObject failed (${response.status}): ${await response.text()}`);
      return { key, etag: response.headers.get('etag'), status: response.status };
    }
    if (action === 'listObjects') {
      const { prefix } = payload as { prefix?: string };
      const url = new URL(`https://${host}/?list-type=2${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}`);
      const signed = signAwsRequest({ method: 'GET', url, region, service: 's3', headers: {}, body: Buffer.alloc(0), credentials: creds });
      const response = await fetch(url, { method: 'GET', headers: signed });
      const text = await response.text();
      if (response.status >= 300) throw new IntegrationActionError(`S3 ListObjectsV2 failed (${response.status}): ${text}`);
      return { xml: text };
    }
    throw new IntegrationActionError(`Unsupported AWS action: ${action}`);
  }
}

/// v1 scope: representative single-service coverage — Azure DevOps work
/// item creation (the natural "push a finding into the customer's Azure
/// board" action). Auth: a Personal Access Token, sent as HTTP Basic with
/// an empty username (Azure DevOps convention: `Basic base64(":pat")`).
/// `config.organization` and `config.project` select the ADO org/project;
/// api-version pinned to a stable GA release.
@Injectable()
export class AzureAdapter implements IntegrationAdapter {
  readonly provider = 'AZURE' as const;
  readonly actions = ['createWorkItem', 'listProjects'];

  private authHeader(credentials: string): string {
    return `Basic ${Buffer.from(`:${credentials}`).toString('base64')}`;
  }

  async testConnection(credentials: string, config: Record<string, unknown> | null): Promise<{ ok: boolean; message: string }> {
    const organization = config?.organization as string | undefined;
    if (!organization) return { ok: false, message: 'Azure integration config.organization is required' };
    const { status, body } = await fetchJson(`https://dev.azure.com/${organization}/_apis/projects?api-version=7.1`, {
      headers: { Authorization: this.authHeader(credentials) },
    });
    if (status !== 200) return { ok: false, message: `Azure DevOps responded ${status}: ${JSON.stringify(body)}` };
    return { ok: true, message: `Connected to Azure DevOps organization ${organization}` };
  }

  async execute(action: string, credentials: string, config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const organization = config?.organization as string | undefined;
    if (!organization) throw new IntegrationActionError('Azure integration config.organization is required');
    const headers = { Authorization: this.authHeader(credentials), 'Content-Type': 'application/json-patch+json' };
    if (action === 'createWorkItem') {
      const { project, title, description, workItemType } = payload as {
        project: string;
        title: string;
        description?: string;
        workItemType?: string;
      };
      const type = encodeURIComponent(workItemType ?? 'Bug');
      const patch = [
        { op: 'add', path: '/fields/System.Title', value: title },
        ...(description ? [{ op: 'add', path: '/fields/System.Description', value: description }] : []),
      ];
      const { status, body } = await fetchJson(
        `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/wit/workitems/$${type}?api-version=7.1`,
        { method: 'POST', headers, body: JSON.stringify(patch) },
      );
      if (status >= 300) throw new IntegrationActionError(`Azure DevOps createWorkItem failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    if (action === 'listProjects') {
      const { status, body } = await fetchJson(`https://dev.azure.com/${organization}/_apis/projects?api-version=7.1`, {
        headers: { Authorization: this.authHeader(credentials) },
      });
      if (status >= 300) throw new IntegrationActionError(`Azure DevOps listProjects failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    throw new IntegrationActionError(`Unsupported Azure action: ${action}`);
  }
}

/// v1 scope: representative single-service coverage — GCP Cloud Storage
/// object upload/list, GCP's closest analogue to the AWS S3 adapter.
/// Auth: an OAuth2 access token (obtained via a service-account JWT
/// exchange or the standard OAuth flow — out of scope for this adapter,
/// which only consumes an already-valid bearer token as `credentials`),
/// sent as `Authorization: Bearer <token>` against the JSON API
/// (`storage.googleapis.com`).
@Injectable()
export class GcpAdapter implements IntegrationAdapter {
  readonly provider = 'GCP' as const;
  readonly actions = ['uploadObject', 'listObjects'];

  private bucket(config: Record<string, unknown> | null): string {
    const bucket = config?.bucket as string | undefined;
    if (!bucket) throw new IntegrationActionError('GCP integration config.bucket is required');
    return bucket;
  }

  async testConnection(credentials: string, config: Record<string, unknown> | null): Promise<{ ok: boolean; message: string }> {
    const bucket = this.bucket(config);
    const { status, body } = await fetchJson(`https://storage.googleapis.com/storage/v1/b/${bucket}`, {
      headers: { Authorization: `Bearer ${credentials}` },
    });
    if (status !== 200) return { ok: false, message: `GCP Cloud Storage responded ${status}: ${JSON.stringify(body)}` };
    return { ok: true, message: `Connected to Cloud Storage bucket ${bucket}` };
  }

  async execute(action: string, credentials: string, config: Record<string, unknown> | null, payload: Record<string, unknown>): Promise<unknown> {
    const bucket = this.bucket(config);
    if (action === 'uploadObject') {
      const { name, contentBase64, contentType } = payload as { name: string; contentBase64: string; contentType?: string };
      const body = Buffer.from(contentBase64, 'base64');
      const response = await fetch(
        `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(name)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${credentials}`, 'Content-Type': contentType ?? 'application/octet-stream' }, body },
      );
      const responseBody: unknown = await response.json();
      if (response.status >= 300) throw new IntegrationActionError(`GCP uploadObject failed (${response.status}): ${JSON.stringify(responseBody)}`);
      return responseBody;
    }
    if (action === 'listObjects') {
      const { status, body } = await fetchJson(`https://storage.googleapis.com/storage/v1/b/${bucket}/o`, {
        headers: { Authorization: `Bearer ${credentials}` },
      });
      if (status >= 300) throw new IntegrationActionError(`GCP listObjects failed (${status}): ${JSON.stringify(body)}`);
      return body;
    }
    throw new IntegrationActionError(`Unsupported GCP action: ${action}`);
  }
}

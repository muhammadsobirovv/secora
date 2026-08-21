import { THREAT_INTEL_ENDPOINTS } from '@pentesthub/shared';
import type {
  IndicatorDto,
  IndicatorStatus,
  IndicatorType,
  ThreatActorDto,
  ThreatCampaignDto,
  ThreatIntelImportLogDto,
  ThreatReportDto,
  ThreatRelationshipDto,
  ThreatTechniqueDto,
} from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

/// Module 17 — CLI task #490 "intel" group. Mirrors `ThreatIntelController`
/// (`/intel/*`) one subcommand per route — see that controller's own doc
/// comment for why indicators/actors/campaigns/reports/techniques/
/// relationships/import-logs/refresh/import/taxii all live under one
/// `intel` prefix rather than split resources.

export async function intelIndicatorsCommand(args: string[]): Promise<void> {
  const type = flagValue(args, '--type');
  const status = flagValue(args, '--status');
  const search = flagValue(args, '--search');
  const limit = flagValue(args, '--limit');

  const http = buildHttpClient(loadConfig());
  const indicators = await http.get<IndicatorDto[]>(THREAT_INTEL_ENDPOINTS.indicators(), {
    type,
    status,
    search,
    limit: limit ? Number(limit) : undefined,
  });
  for (const i of indicators) {
    console.log(`${i.id}\t${i.type}\t${i.value}\t${i.status}\t${i.confidence}\t${i.source}`);
  }
}

export async function intelIndicatorCommand(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) throw new Error('Usage: pentesthub intel indicator <id>');

  const http = buildHttpClient(loadConfig());
  const indicator = await http.get<IndicatorDto>(THREAT_INTEL_ENDPOINTS.indicator(id));
  console.log(JSON.stringify(indicator, null, 2));
}

export async function intelCreateIndicatorCommand(args: string[]): Promise<void> {
  const type = flagValue(args, '--type') as IndicatorType | undefined;
  const value = flagValue(args, '--value');
  if (!type || !value) throw new Error('Usage: pentesthub intel create-indicator --type <TYPE> --value <value> [--confidence 0.5] [--description <text>] [--tags a,b] [--expires-at <iso>]');
  const confidence = flagValue(args, '--confidence');
  const description = flagValue(args, '--description');
  const tags = flagValue(args, '--tags');
  const expiresAt = flagValue(args, '--expires-at');

  const http = buildHttpClient(loadConfig());
  const indicator = await http.post<IndicatorDto>(THREAT_INTEL_ENDPOINTS.indicators(), {
    type,
    value,
    confidence: confidence ? Number(confidence) : undefined,
    description,
    tags: tags ? tags.split(',') : undefined,
    expiresAt,
  });
  console.log(JSON.stringify(indicator, null, 2));
}

export async function intelSetIndicatorStatusCommand(args: string[]): Promise<void> {
  const id = args[0];
  const status = args[1] as IndicatorStatus | undefined;
  if (!id || !status) throw new Error('Usage: pentesthub intel set-indicator-status <id> <ACTIVE|EXPIRED|DISABLED>');

  const http = buildHttpClient(loadConfig());
  const indicator = await http.patch<IndicatorDto>(THREAT_INTEL_ENDPOINTS.setIndicatorStatus(id), { status });
  console.log(JSON.stringify(indicator, null, 2));
}

export async function intelActorsCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const actors = await http.get<ThreatActorDto[]>(THREAT_INTEL_ENDPOINTS.actors());
  for (const a of actors) {
    console.log(`${a.id}\t${a.name}\t${a.aliases.join(',')}`);
  }
}

export async function intelCampaignsCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const campaigns = await http.get<ThreatCampaignDto[]>(THREAT_INTEL_ENDPOINTS.campaigns());
  for (const c of campaigns) {
    console.log(`${c.id}\t${c.name}`);
  }
}

export async function intelReportsCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const reports = await http.get<ThreatReportDto[]>(THREAT_INTEL_ENDPOINTS.reports());
  for (const r of reports) {
    console.log(`${r.id}\t${r.title}\t${r.source}`);
  }
}

export async function intelTechniquesCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const techniques = await http.get<ThreatTechniqueDto[]>(THREAT_INTEL_ENDPOINTS.techniques());
  for (const t of techniques) {
    console.log(`${t.id}\t${t.externalId}\t${t.name}\t${t.tactic ?? ''}`);
  }
}

export async function intelRelationshipsCommand(args: string[]): Promise<void> {
  const objectType = args[0];
  const objectId = args[1];
  if (!objectType || !objectId) throw new Error('Usage: pentesthub intel relationships <objectType> <objectId>');

  const http = buildHttpClient(loadConfig());
  const relationships = await http.get<ThreatRelationshipDto[]>(THREAT_INTEL_ENDPOINTS.relationships(objectType, objectId));
  for (const r of relationships) {
    console.log(`${r.relationType}\t${r.targetType}\t${r.targetId}\t${r.confidence}`);
  }
}

export async function intelImportLogsCommand(): Promise<void> {
  const http = buildHttpClient(loadConfig());
  const logs = await http.get<ThreatIntelImportLogDto[]>(THREAT_INTEL_ENDPOINTS.importLogs());
  console.log(JSON.stringify(logs, null, 2));
}

export async function intelRefreshCommand(args: string[]): Promise<void> {
  const sourceType = flagValue(args, '--source-type');

  const http = buildHttpClient(loadConfig());
  const log = await http.post<ThreatIntelImportLogDto>(THREAT_INTEL_ENDPOINTS.refresh(), {
    sourceType,
  });
  console.log(JSON.stringify(log, null, 2));
}

export async function intelImportStixCommand(args: string[]): Promise<void> {
  const filePath = flagValue(args, '--file');
  if (!filePath) throw new Error('Usage: pentesthub intel import-stix --file <path-to-stix-bundle.json>');
  const { readFileSync } = await import('node:fs');
  const bundle: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));

  const http = buildHttpClient(loadConfig());
  const log = await http.post<ThreatIntelImportLogDto>(THREAT_INTEL_ENDPOINTS.importStix(), { bundle });
  console.log(JSON.stringify(log, null, 2));
}

export async function intelTaxiiPollCommand(args: string[]): Promise<void> {
  const collectionUrl = flagValue(args, '--collection-url');
  if (!collectionUrl) throw new Error('Usage: pentesthub intel taxii-poll --collection-url <url>');

  const http = buildHttpClient(loadConfig());
  const log = await http.post<ThreatIntelImportLogDto>(THREAT_INTEL_ENDPOINTS.taxiiPoll(), { collectionUrl });
  console.log(JSON.stringify(log, null, 2));
}

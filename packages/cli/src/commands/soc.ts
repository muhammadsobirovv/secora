import { SOC_ENDPOINTS } from '@pentesthub/shared';
import type { SocDashboardSummaryDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

/// Module 17 — CLI task #490. Thin wrapper over the composed
/// `/soc/dashboard` route (task #489) — see `SocController`'s own doc
/// comment for why this exists as a single aggregation call rather than
/// four separate ones.
export async function socDashboardCommand(args: string[]): Promise<void> {
  const windowDays = flagValue(args, '--window-days');

  const http = buildHttpClient(loadConfig());
  const summary = await http.get<SocDashboardSummaryDto>(SOC_ENDPOINTS.dashboard(), {
    windowDays: windowDays ? Number(windowDays) : undefined,
  });
  console.log(JSON.stringify(summary, null, 2));
}

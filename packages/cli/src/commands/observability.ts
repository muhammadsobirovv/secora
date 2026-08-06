import { AI_PLATFORM_OBSERVABILITY_ENDPOINTS } from '@pentesthub/shared';
import type { AiPlatformObservabilityDto } from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

export async function observabilityDashboardCommand(args: string[]): Promise<void> {
  const sinceDaysFlagIndex = args.indexOf('--since-days');
  const sinceDays = sinceDaysFlagIndex !== -1 ? args[sinceDaysFlagIndex + 1] : undefined;

  const http = buildHttpClient(loadConfig());
  const dashboard = await http.get<AiPlatformObservabilityDto>(
    AI_PLATFORM_OBSERVABILITY_ENDPOINTS.dashboard,
    sinceDays ? { sinceDays } : undefined,
  );
  console.log(JSON.stringify(dashboard, null, 2));
}

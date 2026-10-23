import type { PipelineStage } from '@pentesthub/shared';

/// The tools each stage runs, with the version the worker image pins. A test
/// checks these against the ARGs in apps/api/Dockerfile.worker, so a bump there
/// that forgets this list fails the build instead of printing a wrong version
/// in every report.
export const PIPELINE_TOOLS: {
  tool: string;
  version: string;
  stage: PipelineStage;
  dockerArg: string | null;
}[] = [
  {
    tool: 'httpx',
    version: '1.12.0',
    stage: 'recon',
    dockerArg: 'HTTPX_VERSION',
  },
  {
    tool: 'subfinder',
    version: '2.16.0',
    stage: 'subdomains',
    dockerArg: 'SUBFINDER_VERSION',
  },
  {
    tool: 'dnsx',
    version: '1.3.1',
    stage: 'resolve',
    dockerArg: 'DNSX_VERSION',
  },
  {
    tool: 'naabu',
    version: '2.6.1',
    stage: 'ports',
    dockerArg: 'NAABU_VERSION',
  },
  {
    tool: 'Secora checks',
    version: 'built-in',
    stage: 'checks',
    dockerArg: null,
  },
  {
    tool: 'katana',
    version: '1.7.0',
    stage: 'crawl',
    dockerArg: 'KATANA_VERSION',
  },
  {
    tool: 'nuclei',
    version: '3.11.1',
    stage: 'scan',
    dockerArg: 'NUCLEI_VERSION',
  },
  {
    tool: 'nuclei-templates',
    version: 'v10.5.0',
    stage: 'scan',
    dockerArg: 'NUCLEI_TEMPLATES_VERSION',
  },
  {
    tool: 'ffuf',
    version: '2.3.0',
    stage: 'content',
    dockerArg: 'FFUF_VERSION',
  },
  {
    tool: 'dalfox',
    version: '3.2.3',
    stage: 'xss',
    dockerArg: 'DALFOX_VERSION',
  },
  {
    tool: 'Secora re-check',
    version: 'built-in',
    stage: 'verify',
    dockerArg: null,
  },
];

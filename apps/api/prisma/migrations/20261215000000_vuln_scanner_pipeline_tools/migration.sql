-- Pipeline-only scanners for profile scans (native checks, subfinder, naabu, dalfox).
ALTER TYPE "VulnScanner" ADD VALUE IF NOT EXISTS 'SECORA_CHECKS';
ALTER TYPE "VulnScanner" ADD VALUE IF NOT EXISTS 'SUBFINDER';
ALTER TYPE "VulnScanner" ADD VALUE IF NOT EXISTS 'NAABU';
ALTER TYPE "VulnScanner" ADD VALUE IF NOT EXISTS 'DALFOX';

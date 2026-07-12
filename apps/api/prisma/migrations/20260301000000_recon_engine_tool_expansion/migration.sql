-- AlterEnum
-- New tool-runners: Amass (subdomain enum), Katana (crawler), Gau + Waybackurls
-- (historical URL discovery), WHOIS (domain registration), ASN (IP-to-ASN via
-- Team Cymru whois). Each ADD VALUE is its own statement — Postgres requires
-- ALTER TYPE ... ADD VALUE to run outside a transaction block that also uses
-- the new value, so this migration only adds values and nothing else.
ALTER TYPE "ReconTool" ADD VALUE 'AMASS';
ALTER TYPE "ReconTool" ADD VALUE 'KATANA';
ALTER TYPE "ReconTool" ADD VALUE 'GAU';
ALTER TYPE "ReconTool" ADD VALUE 'WAYBACKURLS';
ALTER TYPE "ReconTool" ADD VALUE 'WHOIS';
ALTER TYPE "ReconTool" ADD VALUE 'ASN';

-- AlterEnum
-- WHOIS_RECORD and ASN cover data shapes (registrar/registrant/nameservers,
-- and AS number/org/CIDR) that don't fit any existing ReconFindingType.
-- Every other new tool above reuses SUBDOMAIN or URL — see the ADR for why
-- that's deliberate (dedup across tools that report the same subdomain/URL).
ALTER TYPE "ReconFindingType" ADD VALUE 'WHOIS_RECORD';
ALTER TYPE "ReconFindingType" ADD VALUE 'ASN';

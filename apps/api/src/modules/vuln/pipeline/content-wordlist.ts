import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/// The only wordlist the content-discovery stage uses. It is part of the
/// source (reviewed like code), never read from a request or from the job
/// config, and short on purpose: well-known files and directories that should
/// not be publicly reachable. It contains no passwords or usernames and no
/// attack payloads; ffuf only asks whether each path exists.
export const CONTENT_WORDLIST: readonly string[] = [
  // Source control and environment files
  '.git/HEAD',
  '.git/config',
  '.svn/entries',
  '.env',
  '.env.local',
  '.env.production',
  '.htaccess',
  '.htpasswd',
  '.DS_Store',
  '.gitignore',
  '.npmrc',
  // Configuration and project files
  'config.json',
  'config.php',
  'config.yml',
  'web.config',
  'package.json',
  'composer.json',
  'composer.lock',
  'yarn.lock',
  'Dockerfile',
  'docker-compose.yml',
  'id_rsa',
  'wp-config.php.bak',
  // Backups and dumps
  'backup',
  'backup.zip',
  'backup.sql',
  'backup.tar.gz',
  'db.sql',
  'dump.sql',
  'database.sql',
  'site.zip',
  'www.zip',
  // Diagnostics and management endpoints
  'phpinfo.php',
  'info.php',
  'test.php',
  'server-status',
  'server-info',
  'actuator',
  'actuator/health',
  'actuator/env',
  'metrics',
  'prometheus',
  'health',
  'status',
  'debug',
  'console',
  'jmx-console',
  'trace.axd',
  'elmah.axd',
  'WEB-INF/web.xml',
  // Administration and tooling
  'admin',
  'administrator',
  'login',
  'dashboard',
  'manager/html',
  'phpmyadmin',
  'pma',
  'adminer.php',
  'jenkins',
  'solr',
  'kibana',
  'grafana',
  // APIs and documentation
  'api',
  'api/v1',
  'api/v2',
  'v1',
  'v2',
  'rest',
  'graphql',
  'swagger',
  'swagger-ui',
  'swagger.json',
  'openapi.json',
  'api-docs',
  // Directories that are usually not public
  'uploads',
  'upload',
  'files',
  'ftp',
  'static',
  'assets',
  'private',
  'secret',
  'secrets',
  'internal',
  'old',
  'dev',
  'staging',
  'test',
  'tmp',
  'temp',
  'logs',
  'log',
  'error_log',
  'access.log',
  'cgi-bin',
  // Expected public files (reported as INFO)
  'robots.txt',
  'sitemap.xml',
  'crossdomain.xml',
  'security.txt',
  '.well-known/security.txt',
  // Account pages
  'users',
  'user',
  'account',
  'register',
  'signup',
  'forgot-password',
];

/// Writes the list to a fresh private directory (mode 0700) for one ffuf run.
/// `cleanup()` removes it; call it in a `finally`.
export async function writeWordlistFile(): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), 'secora-wordlist-'));
  const path = join(dir, 'words.txt');
  await writeFile(path, `${CONTENT_WORDLIST.join('\n')}\n`, { mode: 0o600 });
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

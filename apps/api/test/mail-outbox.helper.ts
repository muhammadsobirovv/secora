import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUTBOX_DIR = join(process.cwd(), '.mail-outbox');

/// Reads the most recent DevMailService output for a given recipient and
/// extracts a `token=` query param from it — used by e2e tests to get a
/// real verification/reset token the same way a user would (via email),
/// rather than reaching into the database.
export async function readLatestTokenForEmail(email: string): Promise<string> {
  const files = await readdir(OUTBOX_DIR);
  const sanitized = email.replace(/[^a-z0-9]/gi, '_');
  const matches = files.filter((f) => f.includes(sanitized)).sort();
  const latest = matches[matches.length - 1];
  if (!latest) {
    throw new Error(`No mail-outbox file found for ${email}`);
  }
  const content = await readFile(join(OUTBOX_DIR, latest), 'utf-8');
  const match = /[?&]token=([^&\s]+)/.exec(content);
  if (!match) {
    throw new Error(`No token found in mail-outbox file for ${email}`);
  }
  return match[1];
}

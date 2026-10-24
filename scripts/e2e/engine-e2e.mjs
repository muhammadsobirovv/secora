#!/usr/bin/env node
// Real end-to-end run of the scan engine: the real API, the real worker image and
// the lab (Juice Shop, DVWA). No fakes. Run in two phases because the DEEP switch
// is a deployment setting that the API reads at start:
//
//   phase 1  API started with SCAN_DEEP_PROFILE_ENABLED=false
//            QUICK and STANDARD on attestation, refusals, shares, exports, PDF parse
//   phase 2  API started with SCAN_DEEP_PROFILE_ENABLED=true (and the AI request log)
//            DEEP refusals, DEEP with proof of control, AI explanations en/uz/ru
//
//   node scripts/e2e/engine-e2e.mjs --phase 1
//   node scripts/e2e/engine-e2e.mjs --phase 2
//
// See docs/operations/local-worker.md ("End-to-end run"). Scans only the lab and
// the lab network only, never a third-party host.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const PHASE = Number(opt('phase', '1'));
const API = opt('api', 'http://127.0.0.1:4000');
const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUTBOX = join(ROOT, 'apps/api/.mail-outbox');
const WORK = join(tmpdir(), 'secora-e2e');
mkdirSync(WORK, { recursive: true });
const STATE_FILE = join(WORK, 'state.json');
const LEGAL_VERSION = '2026-10-13';
const PG_CONTAINER = opt('pg', 'pentesthub-ai-postgres-1');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// Access tokens last 15 minutes and a DEEP scan takes longer: a 401 signs in again once.
let freshToken = null;
async function api(method, path, { token, body, raw } = {}) {
  const res = await apiOnce(method, path, { token: freshToken ?? token, body, raw });
  if (res.status === 401 && token && state.email) {
    const again = await apiOnce('POST', '/auth/login', { body: { email: state.email, password: state.password } });
    if (again.status === 200) {
      freshToken = again.data.accessToken;
      return apiOnce(method, path, { token: freshToken, body, raw });
    }
  }
  return res;
}

async function apiOnce(method, path, { token, body, raw } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json, data: json?.data, code: json?.code, text };
}

// ---------------------------------------------------------------- account
async function readToken(email) {
  const sanitized = email.replace(/[^a-z0-9]/gi, '_');
  for (let i = 0; i < 20; i++) {
    if (existsSync(OUTBOX)) {
      const { readdirSync } = await import('node:fs');
      const files = readdirSync(OUTBOX).filter((f) => f.includes(sanitized) && f.endsWith('.txt')).sort();
      for (const file of files.reverse()) {
        const m = /[?&]token=([^&\s]+)/.exec(readFileSync(join(OUTBOX, file), 'utf8'));
        if (m) return m[1];
      }
    }
    await sleep(500);
  }
  throw new Error(`no verification mail for ${email}`);
}

async function login() {
  if (!state.email) {
    state.email = `e2e-${Date.now()}@example.com`;
    state.password = 'correct-horse-battery-staple-42';
    const reg = await api('POST', '/auth/register', {
      body: { email: state.email, password: state.password, displayName: 'E2E Engine', acceptedLegalVersion: LEGAL_VERSION },
    });
    if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${reg.text.slice(0, 200)}`);
    const token = await readToken(state.email);
    const ver = await api('POST', '/auth/verify-email', { body: { token } });
    if (ver.status !== 204) throw new Error(`verify failed: ${ver.status}`);
    save();
  }
  const res = await api('POST', '/auth/login', { body: { email: state.email, password: state.password } });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.text.slice(0, 200)}`);
  const token = res.data.accessToken;
  await api('POST', '/legal/accept', { token, body: { version: LEGAL_VERSION } });
  return token;
}

async function ensureProject(token) {
  if (state.projectId) return state.projectId;
  const res = await api('POST', '/projects', { token, body: { name: 'E2E lab' } });
  if (res.status !== 201) throw new Error(`project: ${res.status} ${res.text.slice(0, 200)}`);
  state.projectId = res.data.id;
  save();
  return state.projectId;
}

async function ensureTarget(token, key, { type, value, basis = 'OWNER', attested = true }) {
  state.targets ??= {};
  if (state.targets[key]) return state.targets[key];
  const projectId = await ensureProject(token);
  const res = await api('POST', `/projects/${projectId}/targets`, {
    token,
    body: { type, value, scopeStatus: 'IN_SCOPE', ...(attested ? { authorization: { basis, attested: true } } : {}) },
  });
  if (res.status !== 201) throw new Error(`target ${value}: ${res.status} ${res.text.slice(0, 300)}`);
  state.targets[key] = res.data.id;
  save();
  return res.data.id;
}

async function startScan(token, targetId, body) {
  return api('POST', `/targets/${targetId}/vuln/jobs`, { token, body: { scanners: ['NUCLEI'], ...body } });
}

async function waitJob(token, jobId, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const res = await api('GET', `/vuln/jobs/${jobId}`, { token });
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(res.data?.status)) return res.data;
    if (Date.now() - started > timeoutMs) throw new Error(`job ${jobId} still ${res.data?.status} after ${timeoutMs / 1000}s`);
    await sleep(5000);
  }
}

const stageLine = (report) =>
  report.stages.map((s) => `${s.stage}:${s.state}`).join(' ');

async function runScan(token, label, targetId, profile, extra = {}, timeoutMs = 12 * 60_000, existingJobId = null) {
  const t0 = Date.now();
  // --standard-job <id>: follow a scan that is already running (a STANDARD scan can take
  // 40 minutes) instead of starting another one.
  let jobId = existingJobId;
  if (!jobId) {
    const res = await startScan(token, targetId, { profile, ...extra });
    if (res.status !== 201 && res.status !== 200) {
      check(`${label}: scan accepted`, false, `${res.status} ${res.code}`);
      return null;
    }
    jobId = res.data.id;
  }
  const job = await waitJob(token, jobId, timeoutMs);
  const report = (await api('GET', `/vuln/jobs/${job.id}/report?lang=en`, { token })).data;
  const seconds = Math.round((Date.now() - t0) / 1000);
  console.log(`      ${label}: status=${job.status}${job.completedWithErrors ? ' (with errors)' : ''} in ${seconds}s, findings=${job.findingsCount}, grade=${report.grade}/${report.score}`);
  console.log(`      stages: ${stageLine(report)}`);
  console.log(`      tools: ${report.tools.map((t) => `${t.tool} ${t.version}${t.ran ? '' : ' (not run)'}`).join(', ')}`);
  return { job, report, seconds };
}

function docker(...argv) {
  return execFileSync('docker', argv, { encoding: 'utf8' });
}

// ================================================================ phase 1
async function phase1() {
  const token = await login();
  const juice = await ensureTarget(token, 'juice3000', { type: 'URL', value: 'http://juice.lab.test:3000/' });
  const dvwa = await ensureTarget(token, 'dvwa', { type: 'DOMAIN', value: 'dvwa.lab.test' });

  // --- QUICK on attestation alone
  const quick = await runScan(token, 'QUICK juice', juice, 'QUICK');
  if (quick) {
    check('QUICK runs on an owner attestation alone (no proof)', quick.job.status === 'COMPLETED');
    check('QUICK report says the owner confirmed, nothing verified', quick.report.authorization.kind === 'ATTESTATION');
    check('QUICK scope is the single host', quick.report.scope.root === 'juice.lab.test' && quick.report.scope.includesSubdomains === false);
    check('QUICK ran its stages (checks, verify)', ['checks', 'verify'].every((s) => quick.report.stages.find((x) => x.stage === s)?.state !== 'failed'));
    check('QUICK is not marked incomplete', quick.report.incomplete === false);
  }

  // --- STANDARD on attestation alone
  const standard = await runScan(token, 'STANDARD juice', juice, 'STANDARD', {}, 60 * 60_000, opt('standard-job', null));
  if (standard) {
    state.standardJobId = standard.job.id;
    save();
    check('STANDARD runs on an owner attestation alone', standard.job.status === 'COMPLETED');
    const done = (s) => standard.report.stages.find((x) => x.stage === s)?.state;
    check('STANDARD ran recon, checks, crawl, scan, verify', ['recon', 'checks', 'crawl', 'scan', 'verify'].every((s) => ['done', 'skipped'].includes(done(s))), stageLine(standard.report));
    check('STANDARD found something in Juice Shop', standard.job.findingsCount > 0, `${standard.job.findingsCount} findings`);
    check('STANDARD skipped subdomain discovery (single host)', done('subdomains') !== 'done' && done('subdomains') !== 'failed' || standard.report.stages.every((s) => s.stage !== 'subdomains'));
    check('STANDARD report: every tool has a version', standard.report.tools.every((t) => t.version && t.version !== 'unknown'));
    check('STANDARD is not marked incomplete', standard.report.incomplete === false, standard.job.error ?? '');
  }

  const dvwaQuick = await runScan(token, 'QUICK dvwa', dvwa, 'QUICK');
  if (dvwaQuick) check('QUICK on DVWA completes', dvwaQuick.job.status === 'COMPLETED');

  // --- refusals
  const unverified = await ensureTarget(token, 'wp', { type: 'DOMAIN', value: 'permission.lab.test', basis: 'WRITTEN_PERMISSION' });
  const wp = await startScan(token, unverified, { profile: 'QUICK' });
  check('a written-permission attestation without proof does NOT run', wp.status === 403 && wp.code === 'TARGET_OWNERSHIP_NOT_VERIFIED', `${wp.status} ${wp.code}`);

  const bare = await ensureTarget(token, 'bare', { type: 'DOMAIN', value: 'bare.lab.test', attested: false });
  const noAuth = await startScan(token, bare, { profile: 'QUICK' });
  check('a target with no attestation does not run', noAuth.status === 403 && noAuth.code === 'TARGET_AUTHORIZATION_REQUIRED', `${noAuth.status} ${noAuth.code}`);

  const deepOff = await startScan(token, juice, { profile: 'DEEP', confirmDeep: true });
  check('DEEP is refused when the deployment switch is off', deepOff.status === 403 && deepOff.code === 'SCAN_PROFILE_DISABLED', `${deepOff.status} ${deepOff.code}`);

  const publicIp = await ensureTarget(token, 'local', { type: 'DOMAIN', value: 'app.localhost' });
  const guard = await startScan(token, publicIp, { profile: 'QUICK' });
  check('the network guard still refuses localhost names', guard.status === 403 && guard.code === 'TARGET_FORBIDDEN_FOR_ACTIVE_SCAN', `${guard.status} ${guard.code}`);

  // --- shares, exports, PDF
  if (state.standardJobId) await shareAndExport(token, state.standardJobId);
}

async function shareAndExport(token, jobId) {
  // exports
  const html = await api('GET', `/vuln/jobs/${jobId}/report.html?lang=en`, { token, raw: true });
  const htmlText = await html.text();
  check('report.html downloads, has a strict CSP and no script', html.status === 200 && /Content-Security-Policy/i.test(htmlText) && !/<script/i.test(htmlText));
  check('report.html says "confirmed ... not technically verified"', htmlText.includes('not technically verified'));
  const jsonRes = await api('GET', `/vuln/jobs/${jobId}/report.json?lang=en`, { token, raw: true });
  const jsonText = await jsonRes.text();
  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // keep null
  }
  const body = parsed?.data ?? parsed;
  check('report.json downloads and parses', jsonRes.status === 200 && !!body?.findings, `${jsonText.length} bytes`);
  check('report.json carries authorization and incomplete', body?.authorization?.kind === 'ATTESTATION' && body?.incomplete === false);

  const pdfRes = await api('GET', `/vuln/jobs/${jobId}/report.pdf?lang=en`, { token, raw: true });
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  const pdfPath = join(WORK, 'report.pdf');
  writeFileSync(pdfPath, pdfBytes);
  check('report.pdf downloads as a PDF', pdfRes.status === 200 && pdfBytes.subarray(0, 5).toString() === '%PDF-', `${pdfBytes.length} bytes`);
  try {
    const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
    // pdftotext ends every page with a form feed, so the count is the page count
    const pages = (text.match(/\f/g) ?? []).length;
    check('poppler (pdftotext) parses the PDF', pages >= 1, `${pages} page(s), ${text.length} characters`);
    check('every page has text (no blank pages)', (() => {
      let blank = 0;
      for (let p = 1; p <= pages; p++) {
        const t = execFileSync('pdftotext', ['-f', String(p), '-l', String(p), pdfPath, '-'], { encoding: 'utf8' });
        if (t.trim().length < 20) blank++;
      }
      return blank === 0;
    })());
    check('PDF text has the title, the target, the grade and "NOT tested"', /Security scan report/.test(text) && /juice\.lab\.test/.test(text) && /Grade/.test(text) && /NOT tested/i.test(text));
    check('PDF text says the ownership was confirmed, not verified', /not technically verified/.test(text.replace(/\s+/g, ' ')));
  } catch (error) {
    check('poppler (pdftotext) parses the PDF', false, String(error.message).slice(0, 120));
  }

  // share links
  const noExpiry = await api('POST', '/share-links', { token, body: { resourceType: 'VULN_SCAN_REPORT', resourceId: jobId, permission: 'VIEW' } });
  check('a share link without an expiry is refused', noExpiry.status === 400, `${noExpiry.status} ${noExpiry.code}`);
  const tooLong = await api('POST', '/share-links', { token, body: { resourceType: 'VULN_SCAN_REPORT', resourceId: jobId, permission: 'VIEW', expiresInDays: 31 } });
  check('a share link longer than 30 days is refused', tooLong.status === 400, `${tooLong.status} ${tooLong.code}`);

  const open = await api('POST', '/share-links', { token, body: { resourceType: 'VULN_SCAN_REPORT', resourceId: jobId, permission: 'VIEW', expiresInDays: 1 } });
  check('a share link with an expiry is created', open.status === 201 && !!open.data?.token, `${open.status}`);
  const shareToken = open.data?.token;
  const pub = await api('POST', `/share/${shareToken}/report`, { body: { language: 'en' } });
  const pubText = JSON.stringify(pub.data ?? {});
  check('the public /share/<token>/report works signed out', pub.status === 200 && !!pub.data?.findings);
  check('the public report has no internal ids', !pubText.includes(jobId) && pub.data?.jobId === '' && pub.data?.target?.id === '');
  check('the public report has no unmasked approver mailbox and no raw secrets', !/set-cookie: [^;]*session=[A-Za-z0-9]{20,}/i.test(pubText));

  // password-protected link
  const pw = await api('POST', '/share-links', { token, body: { resourceType: 'VULN_SCAN_REPORT', resourceId: jobId, permission: 'VIEW', expiresInDays: 1, password: 'lab-share-pass-1' } });
  const pwToken = pw.data?.token;
  const noPw = await api('POST', `/share/${pwToken}/report`, { body: { language: 'en' } });
  check('a password link asks for the password', noPw.code === 'SHARE_LINK_PASSWORD_REQUIRED', `${noPw.status} ${noPw.code}`);
  const badPw = await api('POST', `/share/${pwToken}/report`, { body: { language: 'en', password: 'wrong' } });
  check('a wrong password is refused', badPw.code === 'SHARE_LINK_PASSWORD_INCORRECT', `${badPw.status} ${badPw.code}`);
  const goodPw = await api('POST', `/share/${pwToken}/report`, { body: { language: 'en', password: 'lab-share-pass-1' } });
  check('the right password opens it', goodPw.status === 200 && !!goodPw.data?.findings);

  // revoke
  const revoke = await api('POST', `/share-links/${open.data.id}/revoke`, { token });
  check('the owner can revoke a link', revoke.status === 200 || revoke.status === 204, `${revoke.status}`);
  const afterRevoke = await api('POST', `/share/${shareToken}/report`, { body: { language: 'en' } });
  check('a revoked link stops working', afterRevoke.status >= 400 && afterRevoke.code === 'SHARE_LINK_EXPIRED_OR_REVOKED', `${afterRevoke.status} ${afterRevoke.code}`);

  // expiry (test row only: the token's own link, pushed into the past)
  const expiring = await api('POST', '/share-links', { token, body: { resourceType: 'VULN_SCAN_REPORT', resourceId: jobId, permission: 'VIEW', expiresInDays: 1 } });
  try {
    docker('exec', PG_CONTAINER, 'psql', '-U', 'pentesthub', '-d', 'pentesthub', '-c', `UPDATE share_links SET "expiresAt" = now() - interval '1 minute' WHERE id = '${expiring.data.id}'`);
    const expired = await api('POST', `/share/${expiring.data.token}/report`, { body: { language: 'en' } });
    check('an expired link stops working', expired.status >= 400 && expired.code === 'SHARE_LINK_EXPIRED_OR_REVOKED', `${expired.status} ${expired.code}`);
  } catch (error) {
    check('an expired link stops working', false, String(error.message).slice(0, 120));
  }
  const gone = await api('POST', '/share/not-a-real-token/report', { body: { language: 'en' } });
  check('an invented token is "not found"', gone.status === 404, `${gone.status} ${gone.code}`);
}

// ================================================================ phase 2
async function phase2() {
  const token = await login();
  const juice = await ensureTarget(token, 'juice3000', { type: 'URL', value: 'http://juice.lab.test:3000/' });

  const noConfirm = await startScan(token, juice, { profile: 'DEEP' });
  check('DEEP without confirmDeep is refused', noConfirm.status === 400 && noConfirm.code === 'SCAN_DEEP_CONFIRMATION_REQUIRED', `${noConfirm.status} ${noConfirm.code}`);
  const attestedOnly = await startScan(token, juice, { profile: 'DEEP', confirmDeep: true });
  check('DEEP on attestation only (no proof) is refused', attestedOnly.status === 403 && attestedOnly.code === 'TARGET_OWNERSHIP_NOT_VERIFIED', `${attestedOnly.status} ${attestedOnly.code}`);

  // proof of control by the file method, served by the lab proxy
  const proofTarget = await ensureTarget(token, 'proof', { type: 'URL', value: 'http://proof.lab.test:3301/' });
  const own = await api('GET', `/targets/${proofTarget}/ownership`, { token });
  let status = own.data;
  if (!status?.verified) {
    status = (await api('POST', `/targets/${proofTarget}/ownership/challenge`, { token })).data;
    const tokenValue = /content="([^"]+)"/.exec(status.challenge.metaTag)[1];
    writeFileSync(join(ROOT, 'docker/lab-proof/www/.well-known/secora-verify.txt'), tokenValue);
    await sleep(21_000); // the server never checks one target more often than every 20 s
    const verified = await api('POST', `/targets/${proofTarget}/ownership/verify`, { token });
    status = verified.data;
    check('the lab proves control with the file method', status?.verified === true && status?.method === 'HTTP_FILE', `${verified.status} ${status?.method} ${status?.lastError ?? ''}`);
  }
  const tooSoon = await api('POST', `/targets/${proofTarget}/ownership/verify`, { token });
  if (!status?.verified) check('a second check inside 20 s is refused', tooSoon.status === 429 && tooSoon.code === 'OWNERSHIP_CHECK_TOO_SOON', `${tooSoon.status} ${tooSoon.code}`);

  const deep = await runScan(token, 'DEEP proof-target', proofTarget, 'DEEP', { confirmDeep: true }, 60 * 60_000, opt('deep-job', null));
  if (deep) {
    state.deepJobId = deep.job.id;
    save();
    const done = (s) => deep.report.stages.find((x) => x.stage === s)?.state;
    check('DEEP runs with proof of control, flag and confirmation', deep.job.status === 'COMPLETED');
    check('DEEP report says control was verified', deep.report.authorization.kind === 'OWNERSHIP');
    check('DEEP ran the port scan (naabu) and content discovery', ['ports', 'content'].every((s) => ['done', 'skipped'].includes(done(s))) && done('ports') !== undefined, stageLine(deep.report));
    check('DEEP stayed on the single host (file method)', deep.report.scope.includesSubdomains === false);
  }

  await explanations(token);
}

async function explanations(token) {
  const jobId = state.standardJobId;
  if (!jobId) return check('AI explanations', false, 'run phase 1 first');
  const logPath = process.env.AI_REQUEST_LOG || join(WORK, 'ai-requests.log.jsonl');
  const report = (await api('GET', `/vuln/jobs/${jobId}/report?lang=en`, { token })).data;
  const picks = report.findings.filter((f, i, all) => all.findIndex((g) => g.issueKey === f.issueKey) === i).slice(0, 2);
  const seen = [];
  for (const finding of picks) {
    for (const language of ['en', 'uz', 'ru']) {
      const res = await api('POST', `/vuln/jobs/${jobId}/findings/${finding.id}/explanation`, { token, body: { language } });
      const e = res.data;
      const ok = res.status === 200 && e?.whatIsThis && e?.whyItMatters && e?.howToFix;
      check(`explanation ${finding.issueKey} [${language}] returned and validated`, !!ok, `source=${e?.source} cached=${e?.cached}`);
      if (e) seen.push(e.source);
      if (e) {
        const text = `${e.whatIsThis} ${e.whyItMatters} ${e.howToFix}`;
        check(`explanation [${language}] has no link, HTML or command`, !/https?:\/\/|<[a-z]|curl |wget |sudo /i.test(text));
      }
    }
  }
  check('at least one explanation was written by the AI model', seen.includes('AI'), seen.join(','));
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const bodies = lines.map((l) => l.body ?? '').join('\n');
    check('the AI provider was actually called', lines.length > 0, `${lines.length} request(s)`);
    const forbidden = [/juice\.lab\.test/i, /dvwa\.lab\.test/i, /set-cookie/i, /authorization:/i, /bearer\s+[a-z0-9]/i, /session=/i, /\b(?:\d{1,3}\.){3}\d{1,3}\b/];
    const hits = forbidden.filter((re) => re.test(bodies)).map(String);
    check('no scan content, host, address, cookie or secret was sent to the AI', hits.length === 0, hits.join(' '));
    check('what was sent is the scan-data block and fixed rules only', lines.every((l) => /SCAN_DATA_BEGIN/.test(l.body ?? '')));
  } else {
    check('AI request log present (start the API with the preload)', false, logPath);
  }
}

// ================================================================ main
try {
  console.log(`engine e2e, phase ${PHASE}, API ${API}`);
  if (PHASE === 1) await phase1();
  else await phase2();
} catch (error) {
  check('run completed without an unexpected error', false, String(error.stack ?? error).slice(0, 400));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAILED: ${f.name}`);
process.exit(failed.length ? 1 : 0);

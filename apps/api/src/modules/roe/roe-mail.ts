import type { MailMessage } from '../../common/providers/mail/mail-service.interface.js';

/// The emails of the client engagement flow. Every value a user typed (names,
/// roles, asset text) is reduced to one line, length-capped and HTML-escaped
/// before it goes into the message, so it can neither add markup nor forge
/// extra lines or headers. Both a plain-text and an HTML part are produced.

export interface RoeMailAsset {
  type: string;
  value: string;
  wildcard: boolean;
}

export interface RoeMailDetails {
  requesterName: string;
  requesterEmail: string;
  clientName: string;
  assets: RoeMailAsset[];
  windowStart: Date;
  windowEnd: Date;
  signatoryName: string;
  signatoryRole: string;
}

const CONTROL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + '-' + String.fromCharCode(159) + ']', 'g');

/// One line of user text, at most `max` characters, no control characters.
export function oneLine(value: string, max: number): string {
  const cleaned = value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const utc = (date: Date): string => `${date.toISOString().replace('T', ' ').replace(/:\d\d\.\d+Z$/, '')} UTC`;

function describeAsset(asset: RoeMailAsset): string {
  const text = oneLine(asset.value, 200);
  return asset.wildcard ? `${text} (and all of its subdomains)` : text;
}

interface Cleaned {
  requesterName: string;
  requesterEmail: string;
  clientName: string;
  assets: string[];
  wildcard: boolean;
  start: string;
  end: string;
  signatoryName: string;
  signatoryRole: string;
}

function clean(details: RoeMailDetails): Cleaned {
  return {
    requesterName: oneLine(details.requesterName, 120),
    requesterEmail: oneLine(details.requesterEmail, 254),
    clientName: oneLine(details.clientName, 120),
    assets: details.assets.slice(0, 20).map(describeAsset),
    wildcard: details.assets.some((asset) => asset.wildcard),
    start: utc(details.windowStart),
    end: utc(details.windowEnd),
    signatoryName: oneLine(details.signatoryName, 120),
    signatoryRole: oneLine(details.signatoryRole, 120),
  };
}

function detailLines(c: Cleaned): string[] {
  return [
    `Requested by: ${c.requesterName} <${c.requesterEmail}>`,
    `Organisation: ${c.clientName}`,
    `Signed for the organisation by: ${c.signatoryName}, ${c.signatoryRole}`,
    `Assets to be tested:`,
    ...c.assets.map((asset) => `  - ${asset}`),
    `Subdomain wildcard: ${c.wildcard ? 'YES, for the assets marked above' : 'no'}`,
    `Test window: ${c.start} to ${c.end}`,
  ];
}

function detailRows(c: Cleaned): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#475467;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${value}</td></tr>`;
  return [
    row('Requested by', `${escapeHtml(c.requesterName)} &lt;${escapeHtml(c.requesterEmail)}&gt;`),
    row('Organisation', escapeHtml(c.clientName)),
    row('Signed for the organisation by', `${escapeHtml(c.signatoryName)}, ${escapeHtml(c.signatoryRole)}`),
    row('Assets to be tested', `<ul style="margin:0;padding-left:18px">${c.assets.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`),
    row('Subdomain wildcard', c.wildcard ? '<strong>YES</strong>, for the assets marked above' : 'no'),
    row('Test window', `${escapeHtml(c.start)} to ${escapeHtml(c.end)}`),
  ].join('');
}

function page(title: string, intro: string, c: Cleaned, footer: string, buttonUrl: string | null, buttonLabel: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#101828;max-width:560px;margin:0 auto;padding:16px">
<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>
<p>${intro}</p>
<table style="border-collapse:collapse;font-size:14px;margin:12px 0">${detailRows(c)}</table>
${buttonUrl ? `<p><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:#175cd3;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(buttonLabel)}</a></p><p style="font-size:12px;color:#475467">${escapeHtml(buttonUrl)}</p>` : ''}
<p style="font-size:13px;color:#475467">${footer}</p>
</body></html>`;
}

/// The message that asks the client to approve. The link opens a page that
/// shows these details and asks for a click on "Approve" or "Decline"; opening
/// the link (or a mail scanner prefetching it) changes nothing.
export function buildApprovalEmail(details: RoeMailDetails, to: string, approveUrl: string): MailMessage {
  const c = clean(details);
  const subject = `Approval requested: security testing of ${oneLine(c.assets[0] ?? 'your site', 80)}${c.assets.length > 1 ? ` and ${c.assets.length - 1} more` : ''}`;
  const text = [
    `${c.requesterName} (${c.requesterEmail}) asks for your written approval to run security tests against systems of ${c.clientName}.`,
    '',
    ...detailLines(c),
    '',
    'To review and approve or decline, open this link (the link expires in 7 days and works once):',
    approveUrl,
    '',
    'If you did not expect this request, ignore this email, or open the link and choose Decline. Nothing is tested until someone approves.',
    'Only approve if you are authorised to speak for the organisation named above.',
  ].join('\n');
  const html = page(
    'Approval requested for security testing',
    `${escapeHtml(c.requesterName)} (${escapeHtml(c.requesterEmail)}) asks for your written approval to run security tests against systems of <strong>${escapeHtml(c.clientName)}</strong>.`,
    c,
    'The link expires in 7 days and works once. If you did not expect this request, ignore this email, or open the link and choose <strong>Decline</strong>. Nothing is tested until someone approves. Only approve if you are authorised to speak for the organisation named above.',
    approveUrl,
    'Review and decide',
  );
  return { to, subject, text, html };
}

/// Sent to the client after they decide: a record of what they approved and,
/// for an approval, the link that withdraws it.
export function buildConfirmationEmail(
  details: RoeMailDetails,
  to: string,
  outcome: 'APPROVED' | 'DECLINED',
  revokeUrl: string | null,
): MailMessage {
  const c = clean(details);
  const approved = outcome === 'APPROVED';
  const subject = approved ? 'You approved security testing: how to withdraw it' : 'You declined a security testing request';
  const text = [
    approved
      ? `You approved security testing of the assets below for ${c.clientName}.`
      : `You declined the security testing request below for ${c.clientName}. Nothing will be tested.`,
    '',
    ...detailLines(c),
    '',
    ...(approved && revokeUrl
      ? ['To withdraw this approval at any time, open this link and confirm. Testing stops straight away:', revokeUrl]
      : []),
  ].join('\n');
  const html = page(
    approved ? 'You approved security testing' : 'You declined a security testing request',
    approved
      ? `You approved security testing of the assets below for <strong>${escapeHtml(c.clientName)}</strong>.`
      : `You declined the request below for <strong>${escapeHtml(c.clientName)}</strong>. Nothing will be tested.`,
    c,
    approved ? 'You can withdraw this approval at any time with the button above; testing stops straight away.' : '',
    approved ? revokeUrl : null,
    'Withdraw this approval',
  );
  return { to, subject, text, html };
}

/// Sent to the requester when the client has decided or withdrawn.
export function buildRequesterNotice(
  details: RoeMailDetails,
  to: string,
  outcome: 'APPROVED' | 'DECLINED' | 'REVOKED',
  appUrl: string,
): MailMessage {
  const c = clean(details);
  const what = outcome === 'APPROVED' ? 'approved' : outcome === 'DECLINED' ? 'declined' : 'withdrew their approval of';
  const subject = `${c.clientName} ${what} your testing request`;
  const text = [
    `${c.clientName} ${what} your client engagement request.`,
    outcome === 'APPROVED' ? 'You can now scan the listed assets inside the test window.' : 'No scan can run under this request.',
    '',
    ...detailLines(c),
    '',
    appUrl,
  ].join('\n');
  const html = page(
    `${c.clientName} ${what} your request`,
    escapeHtml(outcome === 'APPROVED' ? 'You can now scan the listed assets inside the test window.' : 'No scan can run under this request.'),
    c,
    '',
    appUrl,
    'Open Secora',
  );
  return { to, subject, text, html };
}

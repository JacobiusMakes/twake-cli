/**
 * twake mail — Interact with Twake Mail via JMAP protocol
 * 
 * Usage:
 *   twake mail inbox [--limit]           List inbox messages
 *   twake mail read <id>                 Read a specific email
 *   twake mail search <query>            Search emails
 *   twake mail send <to> <subject>       Send an email (reads body from stdin)
 *   twake mail mailboxes                 List mailboxes/folders
 */

import { Command } from 'commander';
import { getServiceConfig, isServiceConfigured } from '../config.js';
import { validateHttpsUrl, redactTokens, USER_AGENT } from '../security.js';

function requireMail() {
  if (!isServiceConfigured('jmap')) {
    console.error('Twake Mail not configured. Run: twake auth login --mail');
    process.exit(1);
  }
  const cfg = getServiceConfig('jmap');
  // SECURITY: Validate JMAP session URL on every command invocation
  validateHttpsUrl(cfg.sessionUrl, 'JMAP session URL');
  return cfg;
}

/**
 * Raw JMAP request — sends method calls to the JMAP API endpoint.
 * JMAP batches multiple method calls in a single HTTP request.
 */
/**
 * Decode the email (accountId) from a JWT access token without verification.
 * JMAP on TMail uses the email address as the account identifier.
 */
function getAccountIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.email || payload.sub || null;
  } catch {
    return null;
  }
}

async function jmapRequest(cfg, methodCalls, using = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail']) {
  /**
   * TMail's JMAP endpoint serves both session (GET) and API (POST) at /jmap.
   * We try the session fetch first to get apiUrl and accountId.
   * If that fails (404 on .well-known, or GET /jmap not supported),
   * we fall back to decoding the accountId from the JWT token
   * and POSTing directly to the stored URL.
   */
  const apiUrl = cfg.sessionUrl;
  let accountId = cfg.accountId;
  let session = null;

  // Try fetching the JMAP session via GET on the API URL
  if (!accountId) {
    try {
      const sessionRes = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cfg.bearerToken}`,
          'Accept': 'application/json;jmapVersion=rfc-8621',
          'User-Agent': USER_AGENT,
        },
      });
      if (sessionRes.ok) {
        session = await sessionRes.json();
        accountId = Object.keys(session.accounts || {})[0];
      }
    } catch {
      // Session fetch failed, fall through to JWT decode
    }
  }

  // Fallback: extract accountId from the JWT token payload
  if (!accountId) {
    accountId = getAccountIdFromToken(cfg.bearerToken);
  }

  if (!accountId) {
    throw new Error('Could not determine JMAP account ID. Re-run: twake auth login --mail');
  }

  // Inject accountId into method calls
  const calls = methodCalls.map(([method, args, callId]) => [
    method,
    { accountId, ...args },
    callId,
  ]);

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.bearerToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json;jmapVersion=rfc-8621',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ using, methodCalls: calls }),
  });

  if (!res.ok) {
    // SECURITY: redact tokens that might appear in error responses
    throw new Error(`JMAP error ${res.status}: ${redactTokens(res.statusText)}`);
  }

  const data = await res.json();
  return { responses: data.methodResponses, accountId, session };
}

export function mailCommand() {
  const mail = new Command('mail')
    .description('Twake Mail — read and send emails (JMAP protocol)');

  mail
    .command('inbox')
    .description('List inbox messages')
    .option('-n, --limit <count>', 'Number of messages', '20')
    .action(async (opts) => {
      const cfg = requireMail();

      // Get inbox mailbox ID, then query emails
      const { responses } = await jmapRequest(cfg, [
        ['Mailbox/query', { filter: { role: 'inbox' } }, 'findInbox'],
        ['Email/query', {
          filter: { inMailbox: '#findInbox' },
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit: parseInt(opts.limit),
        }, 'emailIds'],
        ['Email/get', {
          '#ids': { resultOf: 'emailIds', name: 'Email/query', path: '/ids' },
          properties: ['id', 'from', 'subject', 'receivedAt', 'preview'],
        }, 'emails'],
      ]);

      // Find the Email/get response
      const emailResponse = responses.find(r => r[2] === 'emails');
      if (!emailResponse) {
        console.log('No response from server.');
        return;
      }

      const emails = emailResponse[1]?.list || [];

      if (!emails.length) {
        console.log('Inbox is empty.');
        return;
      }

      console.log(`Inbox (${emails.length} messages):\n`);

      for (const email of emails) {
        const date = new Date(email.receivedAt).toLocaleDateString();
        const from = email.from?.[0]?.email || 'unknown';
        const subject = email.subject || '(no subject)';
        console.log(`  ${date}  ${from.padEnd(30)} ${subject}`);
        console.log(`          ${email.id}`);
      }
    });

  mail
    .command('search')
    .description('Search emails')
    .argument('<query>', 'Search query')
    .option('-n, --limit <count>', 'Max results', '10')
    .action(async (query, opts) => {
      const cfg = requireMail();

      const { responses } = await jmapRequest(cfg, [
        ['Email/query', {
          filter: { text: query },
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit: parseInt(opts.limit),
        }, 'searchIds'],
        ['Email/get', {
          '#ids': { resultOf: 'searchIds', name: 'Email/query', path: '/ids' },
          properties: ['id', 'from', 'subject', 'receivedAt', 'preview'],
        }, 'results'],
      ]);

      const resultResponse = responses.find(r => r[2] === 'results');
      const emails = resultResponse?.[1]?.list || [];

      if (!emails.length) {
        console.log(`No emails matching "${query}".`);
        return;
      }

      console.log(`Search results for "${query}" (${emails.length}):\n`);

      for (const email of emails) {
        const date = new Date(email.receivedAt).toLocaleDateString();
        const from = email.from?.[0]?.email || 'unknown';
        console.log(`  ${date}  ${from.padEnd(30)} ${email.subject || '(no subject)'}`);
        if (email.preview) {
          console.log(`          ${email.preview.slice(0, 80)}...`);
        }
      }
    });

  mail
    .command('read')
    .description('Read a specific email')
    .argument('<id>', 'Email ID')
    .action(async (id) => {
      const cfg = requireMail();

      const { responses } = await jmapRequest(cfg, [
        ['Email/get', {
          ids: [id],
          properties: ['from', 'to', 'cc', 'subject', 'receivedAt', 'textBody', 'bodyValues'],
          fetchTextBodyValues: true,
        }, 'email'],
      ]);

      const emailResponse = responses.find(r => r[2] === 'email');
      const email = emailResponse?.[1]?.list?.[0];

      if (!email) {
        console.error(`Email ${id} not found.`);
        process.exit(1);
      }

      const from = email.from?.map(a => `${a.name || ''} <${a.email}>`).join(', ') || 'unknown';
      const to = email.to?.map(a => `${a.name || ''} <${a.email}>`).join(', ') || 'unknown';
      const date = new Date(email.receivedAt).toLocaleString();

      console.log(`From:    ${from}`);
      console.log(`To:      ${to}`);
      if (email.cc?.length) {
        console.log(`Cc:      ${email.cc.map(a => a.email).join(', ')}`);
      }
      console.log(`Date:    ${date}`);
      console.log(`Subject: ${email.subject || '(no subject)'}`);
      console.log('---');

      // Print text body
      const bodyPart = email.textBody?.[0];
      if (bodyPart && email.bodyValues?.[bodyPart.partId]) {
        console.log(email.bodyValues[bodyPart.partId].value);
      } else {
        console.log('[No text body available]');
      }
    });

  mail
    .command('mailboxes')
    .description('List mailboxes/folders')
    .action(async () => {
      const cfg = requireMail();

      const { responses } = await jmapRequest(cfg, [
        ['Mailbox/get', { properties: ['id', 'name', 'role', 'totalEmails', 'unreadEmails'] }, 'boxes'],
      ]);

      const boxResponse = responses.find(r => r[2] === 'boxes');
      const mailboxes = boxResponse?.[1]?.list || [];

      if (!mailboxes.length) {
        console.log('No mailboxes found.');
        return;
      }

      console.log('Mailboxes:\n');

      for (const mb of mailboxes) {
        const role = mb.role ? ` (${mb.role})` : '';
        const unread = mb.unreadEmails ? ` [${mb.unreadEmails} unread]` : '';
        console.log(`  ${mb.name}${role}${unread} — ${mb.totalEmails || 0} total`);
      }
    });

  return mail;
}

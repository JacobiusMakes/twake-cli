/**
 * twake search — Unified search across all Twake Workplace products
 * 
 * Searches Chat, Mail, Drive, and LinShare in parallel and 
 * returns results grouped by source.
 * 
 * Usage:
 *   twake search <query>               Search everywhere
 *   twake search <query> --only chat   Search only in chat
 *   twake search <query> --only mail   Search only in mail
 */

import { Command } from 'commander';
import { isServiceConfigured, getServiceConfig } from '../config.js';

export function searchCommand() {
  const search = new Command('search')
    .description('Search across all Twake Workplace products')
    .argument('<query...>', 'Search terms')
    .option('--only <service>', 'Limit to: chat, mail, drive, share')
    .option('-n, --limit <count>', 'Max results per service', '5')
    .action(async (queryParts, opts) => {
      const query = queryParts.join(' ');
      const limit = parseInt(opts.limit);

      console.log(`Searching for "${query}"...\n`);

      const searches = [];
      const only = opts.only?.toLowerCase();

      if ((!only || only === 'chat') && isServiceConfigured('matrix')) {
        searches.push(searchChat(query, limit));
      }
      if ((!only || only === 'mail') && isServiceConfigured('jmap')) {
        searches.push(searchMail(query, limit));
      }
      if ((!only || only === 'drive') && isServiceConfigured('cozy')) {
        searches.push(searchDrive(query, limit));
      }
      if ((!only || only === 'share') && isServiceConfigured('linshare')) {
        searches.push(searchLinshare(query, limit));
      }

      if (!searches.length) {
        console.log('No services configured. Run: twake auth login');
        return;
      }

      const results = await Promise.allSettled(searches);

      let totalResults = 0;
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          totalResults += result.value.count;
        }
      }

      if (totalResults === 0) {
        console.log('No results found across any connected services.');
      }
    });

  return search;
}

async function searchChat(query, limit) {
  const cfg = getServiceConfig('matrix');

  try {
    const url = `${cfg.homeserver}/_matrix/client/v3/search`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        search_categories: {
          room_events: {
            search_term: query,
            order_by: 'recent',
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`${res.status}`);

    const data = await res.json();
    const results = data.search_categories?.room_events?.results || [];
    const sliced = results.slice(0, limit);

    if (sliced.length) {
      console.log(`--- Twake Chat (${sliced.length} results) ---\n`);
      for (const r of sliced) {
        const event = r.result;
        const time = new Date(event.origin_server_ts).toLocaleString();
        const sender = event.sender?.split(':')[0]?.replace('@', '') || '?';
        console.log(`  [${time}] ${sender}: ${event.content?.body || '[no text]'}`);
      }
      console.log('');
    }

    return { count: sliced.length };
  } catch (err) {
    console.log(`--- Twake Chat: search failed (${err.message}) ---\n`);
    return { count: 0 };
  }
}

async function searchMail(query, limit) {
  const cfg = getServiceConfig('jmap');

  try {
    const session = await fetch(cfg.sessionUrl, {
      headers: { 'Authorization': `Bearer ${cfg.bearerToken}` },
    }).then(r => r.json());

    const accountId = cfg.accountId || Object.keys(session.accounts)[0];

    const res = await fetch(session.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
        methodCalls: [
          ['Email/query', { accountId, filter: { text: query }, limit, sort: [{ property: 'receivedAt', isAscending: false }] }, 'q'],
          ['Email/get', { accountId, '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' }, properties: ['from', 'subject', 'receivedAt', 'preview'] }, 'r'],
        ],
      }),
    }).then(r => r.json());

    const emails = res.methodResponses?.find(r => r[2] === 'r')?.[1]?.list || [];

    if (emails.length) {
      console.log(`--- Twake Mail (${emails.length} results) ---\n`);
      for (const e of emails) {
        const date = new Date(e.receivedAt).toLocaleDateString();
        const from = e.from?.[0]?.email || 'unknown';
        console.log(`  ${date}  ${from.padEnd(28)} ${e.subject || '(no subject)'}`);
      }
      console.log('');
    }

    return { count: emails.length };
  } catch (err) {
    console.log(`--- Twake Mail: search failed (${err.message}) ---\n`);
    return { count: 0 };
  }
}

async function searchDrive(query, limit) {
  const cfg = getServiceConfig('cozy');

  try {
    const res = await fetch(`${cfg.instanceUrl}/files/_find`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selector: { name: { '$regex': `(?i)${query}` } },
        limit,
      }),
    }).then(r => r.json());

    const files = res.data || [];

    if (files.length) {
      console.log(`--- Twake Drive (${files.length} results) ---\n`);
      for (const f of files) {
        const attrs = f.attributes || {};
        const type = attrs.type === 'directory' ? 'folder' : 'file';
        console.log(`  [${type}] ${attrs.name || f.id}`);
      }
      console.log('');
    }

    return { count: files.length };
  } catch (err) {
    console.log(`--- Twake Drive: search failed (${err.message}) ---\n`);
    return { count: 0 };
  }
}

async function searchLinshare(query, limit) {
  const cfg = getServiceConfig('linshare');

  try {
    const docs = await fetch(`${cfg.baseUrl}/user/v2/documents`, {
      headers: {
        'Authorization': `Bearer ${cfg.jwt}`,
        'Accept': 'application/json',
      },
    }).then(r => r.json());

    // Client-side filter (LinShare v2 API doesn't have a search endpoint)
    const matches = docs
      .filter(d => d.name?.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit);

    if (matches.length) {
      console.log(`--- LinShare (${matches.length} results) ---\n`);
      for (const d of matches) {
        const date = new Date(d.creationDate).toLocaleDateString();
        console.log(`  ${date}  ${d.name}`);
      }
      console.log('');
    }

    return { count: matches.length };
  } catch (err) {
    console.log(`--- LinShare: search failed (${err.message}) ---\n`);
    return { count: 0 };
  }
}

/**
 * twake share — Interact with LinShare for secure file sharing
 * 
 * Usage:
 *   twake share send <file> --to <email>   Upload and share a file
 *   twake share list                       List your shared documents
 *   twake share received                   List files shared with you
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { getServiceConfig, isServiceConfigured } from '../config.js';
import { validateHttpsUrl, redactTokens, USER_AGENT } from '../security.js';

function requireShare() {
  if (!isServiceConfigured('linshare')) {
    console.error('LinShare not configured. Run: twake auth login --share');
    process.exit(1);
  }
  const cfg = getServiceConfig('linshare');
  // SECURITY: Validate LinShare base URL on every command invocation
  validateHttpsUrl(cfg.baseUrl, 'LinShare base URL');
  return cfg;
}

async function linshareFetch(cfg, endpoint, options = {}) {
  const url = `${cfg.baseUrl}/user/v2${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${cfg.jwt}`,
      'Accept': 'application/json',
      'User-Agent': USER_AGENT, // SECURITY: identify twake-cli in requests
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    // SECURITY: redact tokens that might appear in error responses
    throw new Error(`LinShare error ${res.status}: ${redactTokens(err || res.statusText)}`);
  }

  return res.json();
}

export function shareCommand() {
  const share = new Command('share')
    .description('LinShare — secure file sharing');

  share
    .command('send')
    .description('Upload and share a file')
    .argument('<file>', 'Local file path')
    .requiredOption('--to <emails...>', 'Recipient email(s)')
    .option('--expires <days>', 'Expiry in days', '30')
    .option('--message <msg>', 'Share message')
    .action(async (file, opts) => {
      const cfg = requireShare();
      const fileName = basename(file);
      const fileData = readFileSync(file);

      // Step 1: Upload the document
      console.log(`Uploading ${fileName}...`);

      const form = new FormData();
      form.append('file', new Blob([fileData]), fileName);
      form.append('filesize', fileData.length.toString());

      const uploadUrl = `${cfg.baseUrl}/user/v2/documents`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.jwt}`,
          'User-Agent': USER_AGENT, // SECURITY: identify twake-cli in requests
        },
        body: form,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      const doc = await uploadRes.json();
      console.log(`Uploaded: ${doc.name} (${doc.uuid})`);

      // Step 2: Share with recipients
      const recipients = opts.to.map(email => ({ mail: email }));

      await linshareFetch(cfg, '/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: [doc.uuid],
          recipients,
          sharingNote: opts.message || '',
          expirationDate: new Date(Date.now() + parseInt(opts.expires) * 86400000).toISOString(),
        }),
      });

      console.log(`Shared with: ${opts.to.join(', ')}`);
      console.log(`Expires in ${opts.expires} days`);
    });

  share
    .command('list')
    .description('List your documents')
    .action(async () => {
      const cfg = requireShare();
      const docs = await linshareFetch(cfg, '/documents');

      if (!docs.length) {
        console.log('No documents.');
        return;
      }

      console.log(`Your documents (${docs.length}):\n`);

      for (const doc of docs) {
        const date = new Date(doc.creationDate).toLocaleDateString();
        const size = formatBytes(doc.size || 0);
        console.log(`  ${date}  ${size.padStart(10)}  ${doc.name}`);
        console.log(`          ${doc.uuid}`);
      }
    });

  share
    .command('received')
    .description('List files shared with you')
    .action(async () => {
      const cfg = requireShare();
      const shares = await linshareFetch(cfg, '/received_shares');

      if (!shares.length) {
        console.log('No shared files received.');
        return;
      }

      console.log(`Received shares (${shares.length}):\n`);

      for (const s of shares) {
        const date = new Date(s.creationDate).toLocaleDateString();
        const from = s.sender?.mail || 'unknown';
        console.log(`  ${date}  from ${from.padEnd(25)} ${s.name}`);
      }
    });

  return share;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

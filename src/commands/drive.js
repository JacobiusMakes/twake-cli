/**
 * twake drive — Interact with Twake Drive via Cozy API
 * 
 * Usage:
 *   twake drive ls [path]              List files and folders
 *   twake drive upload <file> [--to]   Upload a file
 *   twake drive download <id> [--out]  Download a file
 *   twake drive mkdir <name>           Create a folder
 *   twake drive info <id>              Get file metadata
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { getServiceConfig, isServiceConfigured } from '../config.js';

function requireDrive() {
  if (!isServiceConfigured('cozy')) {
    console.error('Twake Drive not configured. Run: twake auth login --drive');
    process.exit(1);
  }
  return getServiceConfig('cozy');
}

async function cozyFetch(cfg, endpoint, options = {}) {
  const url = `${cfg.instanceUrl}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Cozy API error ${res.status}: ${err || res.statusText}`);
  }

  return res.json();
}

export function driveCommand() {
  const drive = new Command('drive')
    .description('Twake Drive — manage files and folders (Cozy API)');

  drive
    .command('ls')
    .description('List files and folders')
    .argument('[path]', 'Folder path or ID', '/')
    .option('-l, --long', 'Show detailed info')
    .action(async (path, opts) => {
      const cfg = requireDrive();

      // Get directory ID from path
      let dirId;
      if (path === '/') {
        dirId = 'io.cozy.files.root-dir';
      } else if (path.startsWith('io.cozy.files')) {
        dirId = path;
      } else {
        // Resolve path to ID
        const encoded = encodeURIComponent(path);
        const resolved = await cozyFetch(cfg, `/files/metadata?Path=${encoded}`);
        dirId = resolved.data?.id;
      }

      const data = await cozyFetch(cfg, `/files/${dirId}`);
      const contents = data.included || data.data?.relationships?.contents?.data || [];

      if (!contents.length) {
        console.log('(empty folder)');
        return;
      }

      for (const item of contents) {
        const attrs = item.attributes || {};
        const type = attrs.type === 'directory' ? 'd' : 'f';
        const name = attrs.name || item.id;

        if (opts.long) {
          const size = attrs.size ? formatBytes(attrs.size) : '-';
          const modified = attrs.updated_at ? new Date(attrs.updated_at).toLocaleDateString() : '-';
          console.log(`  ${type}  ${modified}  ${size.padStart(10)}  ${name}`);
        } else {
          const prefix = type === 'd' ? '/' : ' ';
          console.log(`  ${prefix}${name}`);
        }
      }
    });

  drive
    .command('upload')
    .description('Upload a file')
    .argument('<file>', 'Local file path')
    .option('--to <folderId>', 'Destination folder ID', 'io.cozy.files.root-dir')
    .action(async (file, opts) => {
      const cfg = requireDrive();
      const fileName = basename(file);
      const fileData = readFileSync(file);

      const url = `${cfg.instanceUrl}/files/${opts.to}?Type=file&Name=${encodeURIComponent(fileName)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: fileData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      console.log(`Uploaded ${fileName} (${formatBytes(fileData.length)})`);
      console.log(`  ID: ${data.data?.id}`);
    });

  drive
    .command('download')
    .description('Download a file')
    .argument('<id>', 'File ID')
    .option('-o, --out <path>', 'Output file path')
    .action(async (id, opts) => {
      const cfg = requireDrive();

      const url = `${cfg.instanceUrl}/files/downloads/${id}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${cfg.token}` },
      });

      if (!res.ok) {
        throw new Error(`Download failed: ${res.status}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const outPath = opts.out || id;
      writeFileSync(outPath, buffer);
      console.log(`Downloaded to ${outPath} (${formatBytes(buffer.length)})`);
    });

  drive
    .command('mkdir')
    .description('Create a folder')
    .argument('<name>', 'Folder name')
    .option('--in <parentId>', 'Parent folder ID', 'io.cozy.files.root-dir')
    .action(async (name, opts) => {
      const cfg = requireDrive();

      const url = `${cfg.instanceUrl}/files/${opts.in}?Type=directory&Name=${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.token}`,
          'Content-Type': 'application/vnd.api+json',
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to create folder: ${res.status}`);
      }

      const data = await res.json();
      console.log(`Created folder "${name}" (${data.data?.id})`);
    });

  return drive;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

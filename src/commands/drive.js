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
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { basename, join, relative } from 'path';
import { getServiceConfig, isServiceConfigured } from '../config.js';
import { validateHttpsUrl, redactTokens, USER_AGENT } from '../security.js';

function requireDrive() {
  if (!isServiceConfigured('cozy')) {
    console.error('Twake Drive not configured. Run: twake auth login --drive');
    process.exit(1);
  }
  const cfg = getServiceConfig('cozy');
  // SECURITY: Validate instance URL on every command invocation
  validateHttpsUrl(cfg.instanceUrl, 'Cozy instance URL');
  return cfg;
}

async function cozyFetch(cfg, endpoint, options = {}) {
  const url = `${cfg.instanceUrl}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
      'User-Agent': USER_AGENT, // SECURITY: identify twake-cli in requests
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    // SECURITY: redact tokens that might appear in error responses
    throw new Error(`Cozy API error ${res.status}: ${redactTokens(err || res.statusText)}`);
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
          'User-Agent': USER_AGENT, // SECURITY: identify twake-cli in requests
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
        headers: {
          'Authorization': `Bearer ${cfg.token}`,
          'User-Agent': USER_AGENT, // SECURITY: identify twake-cli in requests
        },
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
          'User-Agent': USER_AGENT, // SECURITY: identify twake-cli in requests
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to create folder: ${res.status}`);
      }

      const data = await res.json();
      console.log(`Created folder "${name}" (${data.data?.id})`);
    });

  drive
    .command('sync')
    .description('Sync a local folder with Twake Drive')
    .argument('<local>', 'Local folder path')
    .option('--remote <id>', 'Remote folder ID', 'io.cozy.files.root-dir')
    .option('--dry-run', 'Show what would be synced without making changes', false)
    .option('--direction <dir>', 'Sync direction: up (local→remote), down (remote→local), both', 'both')
    .action(async (localPath, opts) => {
      const cfg = requireDrive();

      if (!existsSync(localPath)) {
        if (opts.direction === 'down' || opts.direction === 'both') {
          mkdirSync(localPath, { recursive: true });
          console.log(`Created local folder: ${localPath}`);
        } else {
          console.error(`Local folder not found: ${localPath}`);
          process.exit(1);
        }
      }

      console.log(`Syncing ${localPath} ↔ Twake Drive (${opts.remote})`);
      if (opts.dryRun) console.log('  (dry run — no changes will be made)\n');
      else console.log('');

      // Get remote file listing
      const remoteData = await cozyFetch(cfg, `/files/${opts.remote}`);
      const remoteFiles = (remoteData.included || []).map(item => ({
        id: item.id,
        name: item.attributes?.name || item.id,
        type: item.attributes?.type,
        size: item.attributes?.size || 0,
        updated: item.attributes?.updated_at ? new Date(item.attributes.updated_at) : new Date(0),
      }));

      const remoteFileMap = new Map(remoteFiles.map(f => [f.name, f]));

      // Get local file listing (non-recursive for now)
      const localFiles = readdirSync(localPath)
        .filter(name => !name.startsWith('.'))
        .map(name => {
          const fullPath = join(localPath, name);
          const stat = statSync(fullPath);
          return {
            name,
            path: fullPath,
            isDir: stat.isDirectory(),
            size: stat.size,
            modified: stat.mtime,
          };
        })
        .filter(f => !f.isDir); // Files only for now

      const localFileMap = new Map(localFiles.map(f => [f.name, f]));

      let uploaded = 0, downloaded = 0, skipped = 0;

      // Upload: local files missing from remote
      if (opts.direction === 'up' || opts.direction === 'both') {
        for (const local of localFiles) {
          const remote = remoteFileMap.get(local.name);

          if (!remote) {
            // File exists locally but not remotely → upload
            if (opts.dryRun) {
              console.log(`  ↑ UPLOAD  ${local.name} (${formatBytes(local.size)})`);
            } else {
              const fileData = readFileSync(local.path);
              const url = `${cfg.instanceUrl}/files/${opts.remote}?Type=file&Name=${encodeURIComponent(local.name)}`;
              const res = await fetch(url, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${cfg.token}`,
                  'Content-Type': 'application/octet-stream',
                  'User-Agent': USER_AGENT,
                },
                body: fileData,
              });
              if (res.ok) {
                console.log(`  ↑ uploaded ${local.name} (${formatBytes(local.size)})`);
                uploaded++;
              } else {
                console.error(`  ✗ failed to upload ${local.name}: ${res.status}`);
              }
            }
          } else if (local.modified > remote.updated && local.size !== remote.size) {
            // Local is newer and different size → upload (overwrite)
            if (opts.dryRun) {
              console.log(`  ↑ UPDATE  ${local.name} (local newer)`);
            } else {
              // Delete remote, re-upload (Cozy doesn't have a simple overwrite)
              try {
                await fetch(`${cfg.instanceUrl}/files/${remote.id}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${cfg.token}`, 'User-Agent': USER_AGENT },
                });
              } catch { /* ignore delete failures */ }

              const fileData = readFileSync(local.path);
              const url = `${cfg.instanceUrl}/files/${opts.remote}?Type=file&Name=${encodeURIComponent(local.name)}`;
              const res = await fetch(url, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${cfg.token}`,
                  'Content-Type': 'application/octet-stream',
                  'User-Agent': USER_AGENT,
                },
                body: fileData,
              });
              if (res.ok) {
                console.log(`  ↑ updated ${local.name}`);
                uploaded++;
              }
            }
          } else {
            skipped++;
          }
        }
      }

      // Download: remote files missing locally
      if (opts.direction === 'down' || opts.direction === 'both') {
        for (const remote of remoteFiles) {
          if (remote.type === 'directory') continue; // Skip dirs for now

          const local = localFileMap.get(remote.name);

          if (!local) {
            // File exists remotely but not locally → download
            if (opts.dryRun) {
              console.log(`  ↓ DOWNLOAD  ${remote.name} (${formatBytes(remote.size)})`);
            } else {
              const dlRes = await fetch(`${cfg.instanceUrl}/files/downloads/${remote.id}`, {
                headers: { 'Authorization': `Bearer ${cfg.token}`, 'User-Agent': USER_AGENT },
              });
              if (dlRes.ok) {
                const buffer = Buffer.from(await dlRes.arrayBuffer());
                writeFileSync(join(localPath, remote.name), buffer);
                console.log(`  ↓ downloaded ${remote.name} (${formatBytes(buffer.length)})`);
                downloaded++;
              } else {
                console.error(`  ✗ failed to download ${remote.name}: ${dlRes.status}`);
              }
            }
          } else if (remote.updated > local.modified && remote.size !== local.size) {
            // Remote is newer → download
            if (opts.dryRun) {
              console.log(`  ↓ UPDATE  ${remote.name} (remote newer)`);
            } else {
              const dlRes = await fetch(`${cfg.instanceUrl}/files/downloads/${remote.id}`, {
                headers: { 'Authorization': `Bearer ${cfg.token}`, 'User-Agent': USER_AGENT },
              });
              if (dlRes.ok) {
                const buffer = Buffer.from(await dlRes.arrayBuffer());
                writeFileSync(join(localPath, remote.name), buffer);
                console.log(`  ↓ updated ${remote.name}`);
                downloaded++;
              }
            }
          } else {
            skipped++;
          }
        }
      }

      console.log(`\nSync complete: ${uploaded} uploaded, ${downloaded} downloaded, ${skipped} unchanged`);
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

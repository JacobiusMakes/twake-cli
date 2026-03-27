/**
 * twake chat — Interact with Twake Chat via Matrix protocol
 * 
 * Usage:
 *   twake chat send <room> <message>     Send a message to a room
 *   twake chat rooms                     List joined rooms
 *   twake chat history <room> [--limit]  Show recent messages
 *   twake chat listen <room>             Stream messages in real-time
 */

import { Command } from 'commander';
import { getServiceConfig, isServiceConfigured } from '../config.js';
import { validateHttpsUrl, validateRoomId, redactTokens, safeError, USER_AGENT } from '../security.js';

function requireChat() {
  if (!isServiceConfigured('matrix')) {
    console.error('Twake Chat not configured. Run: twake auth login --chat');
    process.exit(1);
  }
  const cfg = getServiceConfig('matrix');
  // SECURITY: Validate homeserver URL on every command invocation,
  // in case the config was edited manually with a bad value.
  validateHttpsUrl(cfg.homeserver, 'Matrix homeserver URL');
  return cfg;
}

/**
 * Create an HTTP client for Matrix API calls.
 * We use raw fetch to keep dependencies minimal for the MVP.
 * A future version could use matrix-bot-sdk for richer features.
 */
async function matrixFetch(cfg, endpoint, options = {}) {
  const url = `${cfg.homeserver}/_matrix/client/v3${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${cfg.accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT, // SECURITY: identify twake-cli in requests
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // SECURITY: redact tokens that might appear in error responses
    throw new Error(`Matrix API error ${res.status}: ${redactTokens(err.error || res.statusText)}`);
  }

  return res.json();
}

export function chatCommand() {
  const chat = new Command('chat')
    .description('Twake Chat — send and read messages (Matrix protocol)');

  chat
    .command('send')
    .description('Send a message to a room')
    .argument('<room>', 'Room ID or alias (e.g. #engineering:twake.app)')
    .argument('<message...>', 'Message text')
    .action(async (room, messageParts) => {
      const cfg = requireChat();

      // SECURITY: Validate room ID format (must start with ! or #).
      // Prevents sending messages to unexpected endpoints.
      validateRoomId(room);

      const message = messageParts.join(' ');

      /**
       * NOTE: The message body is sent as-is to the Matrix homeserver.
       * Matrix servers handle HTML sanitization and rendering. Client-side
       * sanitization here would break intentional formatting. The server
       * is the trust boundary for message content.
       */

      // Resolve room alias to ID if needed
      let roomId = room;
      if (room.startsWith('#')) {
        const resolved = await matrixFetch(cfg, `/directory/room/${encodeURIComponent(room)}`);
        roomId = resolved.room_id;
      }

      // Generate a transaction ID
      const txnId = `twake-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await matrixFetch(cfg, `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
        method: 'PUT',
        body: JSON.stringify({
          msgtype: 'm.text',
          body: message,
        }),
      });

      console.log(`Message sent to ${room}`);
    });

  chat
    .command('attach')
    .description('Send a file to a room')
    .argument('<room>', 'Room ID or alias')
    .argument('<file>', 'Local file path')
    .option('--message <msg>', 'Optional message with the file')
    .action(async (room, file, opts) => {
      const cfg = requireChat();
      const { readFileSync, statSync } = await import('fs');
      const { basename, extname } = await import('path');

      validateRoomId(room);

      let roomId = room;
      if (room.startsWith('#')) {
        const resolved = await matrixFetch(cfg, `/directory/room/${encodeURIComponent(room)}`);
        roomId = resolved.room_id;
      }

      const fileName = basename(file);
      const fileData = readFileSync(file);
      const fileSize = statSync(file).size;

      // Detect MIME type from extension
      const mimeTypes = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf', '.txt': 'text/plain',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.mp4': 'video/mp4', '.webm': 'video/webm',
        '.zip': 'application/zip', '.json': 'application/json',
      };
      const ext = extname(fileName).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      // Step 1: Upload file to Matrix content repository
      const uploadUrl = `${cfg.homeserver}/_matrix/media/v3/upload?filename=${encodeURIComponent(fileName)}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.accessToken}`,
          'Content-Type': contentType,
          'User-Agent': USER_AGENT,
        },
        body: fileData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
      }

      const { content_uri: contentUri } = await uploadRes.json();

      // Step 2: Send message with file attachment
      const txnId = `twake-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Determine message type based on MIME
      let msgtype = 'm.file';
      if (contentType.startsWith('image/')) msgtype = 'm.image';
      else if (contentType.startsWith('audio/')) msgtype = 'm.audio';
      else if (contentType.startsWith('video/')) msgtype = 'm.video';

      const msgBody = {
        msgtype,
        body: opts.message || fileName,
        filename: fileName,
        url: contentUri,
        info: {
          mimetype: contentType,
          size: fileSize,
        },
      };

      await matrixFetch(cfg, `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`, {
        method: 'PUT',
        body: JSON.stringify(msgBody),
      });

      const sizeStr = fileSize < 1024 ? `${fileSize} B` : `${(fileSize / 1024).toFixed(1)} KB`;
      console.log(`Sent ${fileName} (${sizeStr}, ${contentType}) to ${room}`);
    });

  chat
    .command('rooms')
    .description('List joined rooms')
    .action(async () => {
      const cfg = requireChat();
      const data = await matrixFetch(cfg, '/joined_rooms');

      if (!data.joined_rooms?.length) {
        console.log('No joined rooms.');
        return;
      }

      console.log(`Joined rooms (${data.joined_rooms.length}):\n`);

      // Fetch room names in parallel
      const rooms = await Promise.all(
        data.joined_rooms.map(async (roomId) => {
          try {
            const state = await matrixFetch(
              cfg,
              `/rooms/${encodeURIComponent(roomId)}/state/m.room.name`
            );
            return { id: roomId, name: state.name || '(unnamed)' };
          } catch {
            return { id: roomId, name: '(unnamed)' };
          }
        })
      );

      for (const room of rooms) {
        console.log(`  ${room.name.padEnd(30)} ${room.id}`);
      }
    });

  chat
    .command('create')
    .description('Create a new room')
    .argument('<name>', 'Room name')
    .option('--alias <alias>', 'Room alias (e.g. engineering)')
    .option('--topic <topic>', 'Room topic')
    .option('--private', 'Make room invite-only', false)
    .action(async (name, opts) => {
      const cfg = requireChat();

      const body = {
        name,
        visibility: opts.private ? 'private' : 'public',
        preset: opts.private ? 'private_chat' : 'public_chat',
      };
      if (opts.alias) body.room_alias_name = opts.alias;
      if (opts.topic) body.topic = opts.topic;

      const data = await matrixFetch(cfg, '/createRoom', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      console.log(`Created room "${name}"`);
      console.log(`  ID: ${data.room_id}`);
      if (opts.alias) {
        console.log(`  Alias: #${opts.alias}:twake.app`);
      }
      console.log(`\nSend a message: twake chat send '${data.room_id}' "hello world"`);
    });

  chat
    .command('history')
    .description('Show recent messages in a room')
    .argument('<room>', 'Room ID or alias')
    .option('-n, --limit <count>', 'Number of messages', '20')
    .action(async (room, opts) => {
      const cfg = requireChat();

      // SECURITY: Validate room ID format before making API calls
      validateRoomId(room);

      let roomId = room;
      if (room.startsWith('#')) {
        const resolved = await matrixFetch(cfg, `/directory/room/${encodeURIComponent(room)}`);
        roomId = resolved.room_id;
      }

      const data = await matrixFetch(
        cfg,
        `/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${opts.limit}`
      );

      const messages = (data.chunk || [])
        .filter(e => e.type === 'm.room.message')
        .reverse();

      if (!messages.length) {
        console.log('No messages found.');
        return;
      }

      for (const msg of messages) {
        const time = new Date(msg.origin_server_ts).toLocaleTimeString();
        const sender = msg.sender.split(':')[0].replace('@', '');
        const body = msg.content?.body || '[no text]';
        console.log(`  [${time}] ${sender}: ${body}`);
      }
    });

  chat
    .command('listen')
    .description('Stream messages from a room in real-time')
    .argument('<room>', 'Room ID or alias')
    .action(async (room) => {
      const cfg = requireChat();

      // SECURITY: Validate room ID format before making API calls
      validateRoomId(room);

      let roomId = room;
      if (room.startsWith('#')) {
        const resolved = await matrixFetch(cfg, `/directory/room/${encodeURIComponent(room)}`);
        roomId = resolved.room_id;
      }

      console.log(`Listening to ${room} (Ctrl+C to stop)...\n`);

      // Initial sync to get a since token
      let since = '';
      const initialSync = await matrixFetch(cfg, '/sync?timeout=0&filter={"room":{"timeline":{"limit":1}}}');
      since = initialSync.next_batch;

      // Long-poll loop
      while (true) {
        try {
          const sync = await matrixFetch(
            cfg,
            `/sync?since=${since}&timeout=30000&filter={"room":{"timeline":{"limit":50}}}`
          );
          since = sync.next_batch;

          const roomData = sync.rooms?.join?.[roomId];
          if (roomData?.timeline?.events) {
            for (const event of roomData.timeline.events) {
              if (event.type === 'm.room.message' && event.content?.body) {
                const time = new Date(event.origin_server_ts).toLocaleTimeString();
                const sender = event.sender.split(':')[0].replace('@', '');
                console.log(`  [${time}] ${sender}: ${event.content.body}`);
              }
            }
          }
        } catch (err) {
          // SECURITY: redact tokens from sync error messages
          safeError(`Sync error: ${err.message}. Retrying...`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    });

  return chat;
}

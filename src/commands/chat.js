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

function requireChat() {
  if (!isServiceConfigured('matrix')) {
    console.error('Twake Chat not configured. Run: twake auth login --chat');
    process.exit(1);
  }
  return getServiceConfig('matrix');
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
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Matrix API error ${res.status}: ${err.error || res.statusText}`);
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
      const message = messageParts.join(' ');

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
          console.error(`Sync error: ${err.message}. Retrying...`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    });

  return chat;
}

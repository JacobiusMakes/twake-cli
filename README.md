# twake-cli

> Command-line interface for [Twake Workplace](https://linagora.com/en/twake-workplace) — chat, mail, drive, and file sharing from your terminal.

A unified CLI for interacting with Linagora's open-source collaboration suite. Built on the open protocols that power Twake Workplace:

- **Twake Chat** via the [Matrix](https://matrix.org) client-server API
- **Twake Mail** via [JMAP](https://jmap.io) (RFC 8620/8621)
- **Twake Drive** via the [Cozy](https://cozy.io) API
- **LinShare** via the LinShare REST API

## Demo

> Record your own: `asciinema rec --cols 90 --rows 30 demo.cast -c "bash demo.sh"` then `agg demo.cast demo.gif`

```
$ twake auth whoami
Twake CLI — Service connections:

  ✓ Twake Chat     connected (@jacob:twake.app)
  ✓ Twake Mail     connected (https://jmap.twake.app/jmap/session)
  ✓ Twake Drive    connected (https://jacob.twake.app)
  ✗ LinShare       not configured

$ twake chat rooms
Joined rooms (1):

  twake-cli-dev                  !JIdHIALrfERppYiLhI:twake.app

$ twake chat send '!JIdHIALrfERppYiLhI:twake.app' 'Hello from twake-cli!'
Message sent to !JIdHIALrfERppYiLhI:twake.app

$ twake drive ls
  /Administrative
  /Photos
   demo-file.txt

$ twake drive upload ./report.pdf
Uploaded report.pdf (14.2 KB)
  ID: 019d288c-c353-7d8c-b857-890b351dfe15

$ twake mail mailboxes
Mailboxes:

  INBOX (inbox) — 1 total
  Sent (sent) — 1 total
  Drafts (drafts) — 0 total
  Trash (trash) — 0 total

$ twake search "quarterly report"
Searching for "quarterly report"...

--- Twake Chat (2 results) ---
  [3/26/2026, 9:15 AM] alice: The quarterly report is in Drive
  [3/25/2026, 4:30 PM] jacob: Uploading quarterly report now

--- Twake Mail (1 results) ---
  3/26/2026  finance@company.com          Q1 Quarterly Report - Final

--- Twake Drive (1 results) ---
  quarterly-report-q1.pdf  (2.1 MB)  modified 3/26/2026
```

All commands hit **live Twake Workplace infrastructure** — no mocks, no stubs.

## Why?

Every major collaboration platform has a CLI — Slack, GitHub, Vercel, AWS. Twake Workplace deserves one too. `twake-cli` gives developers and power users terminal-native access to the entire Twake ecosystem, and enables scripting, automation, and CI/CD integration with open-source collaboration tools.

## Install

```bash
git clone https://github.com/JacobiusMakes/twake-cli.git
cd twake-cli
npm install
npm link
```

Requires Node.js >= 18.

## Quick start

```bash
# Authenticate with Twake Chat (opens browser for SSO)
twake auth login --chat

# Authenticate with Twake Drive (Cozy OAuth flow)
twake auth login --drive

# Check what's connected
twake auth whoami

# Send a chat message
twake chat send '#general:twake.app' "Hello from the terminal!"

# Check your inbox
twake mail inbox

# Upload a file
twake drive upload ./report.pdf

# Search across everything
twake search "Q3 budget"
```

## Commands

### `twake auth`

| Command | Description |
|---------|-------------|
| `twake auth login` | Interactive setup for all services |
| `twake auth login --chat` | Configure only Twake Chat |
| `twake auth login --mail` | Configure only Twake Mail |
| `twake auth login --drive` | Configure only Twake Drive |
| `twake auth login --share` | Configure only LinShare |
| `twake auth logout` | Clear all credentials |
| `twake auth whoami` | Show current auth status |

Non-interactive mode (for CI/scripting):

```bash
twake auth login --chat --homeserver https://matrix.twake.app --token syt_xxx --user @me:twake.app
```

### `twake chat`

| Command | Description |
|---------|-------------|
| `twake chat send <room> <message>` | Send a message |
| `twake chat rooms` | List joined rooms |
| `twake chat history <room> [-n 20]` | Recent messages |
| `twake chat listen <room>` | Real-time message stream |

### `twake mail`

| Command | Description |
|---------|-------------|
| `twake mail inbox [-n 20]` | List inbox messages |
| `twake mail read <id>` | Read a specific email |
| `twake mail search <query>` | Search emails |
| `twake mail mailboxes` | List mailboxes/folders |

### `twake drive`

| Command | Description |
|---------|-------------|
| `twake drive ls [path]` | List files and folders |
| `twake drive upload <file> [--to folder]` | Upload a file |
| `twake drive download <id> [-o path]` | Download a file |
| `twake drive mkdir <name>` | Create a folder |

### `twake share`

| Command | Description |
|---------|-------------|
| `twake share send <file> --to <email>` | Upload and share |
| `twake share list` | Your shared documents |
| `twake share received` | Files shared with you |

### `twake search`

Unified search across all connected services:

```bash
twake search "project proposal"
twake search "invoice" --only mail
twake search "architecture diagram" --only drive
```

## Configuration

Credentials are stored in `~/.config/twake-cli/config.json`. The file contains access tokens — keep it secure (`chmod 600`).

## Security

Tokens are stored locally with `0600` file permissions (owner-only). All commands:

- Validate HTTPS URLs before making requests
- Redact tokens from error messages (global + per-command)
- Use timing-safe comparison for OAuth state parameters
- Rate-limit local OAuth callback servers (single-use)
- Send a `User-Agent` header identifying `twake-cli`

See [`src/security.js`](src/security.js) for the full security module.

## Architecture

```
twake-cli/
├── bin/twake.js          # Entry point & command routing
├── src/
│   ├── config.js         # Config manager (token storage, 0600 perms)
│   ├── security.js       # Security utilities (redaction, validation)
│   └── commands/
│       ├── auth.js       # SSO & OAuth flows (Matrix, Cozy, OIDC)
│       ├── chat.js       # Matrix client-server API
│       ├── mail.js       # JMAP protocol (RFC 8620/8621)
│       ├── drive.js      # Cozy API for file management
│       ├── share.js      # LinShare REST API
│       ├── search.js     # Unified cross-product search
│       └── status.js     # Connection status overview
├── demo.sh               # Interactive demo script
└── package.json
```

Each command module is self-contained with its own API client. Auth flows use browser-based SSO/OAuth with local callback servers — no passwords stored.

## Open source

Licensed under AGPL-3.0 to match Linagora's licensing. Contributions welcome.

Built with respect for Linagora's mission of digital sovereignty and open-source collaboration tools for Europe.

## Roadmap

- [ ] `twake chat send` with file attachments
- [ ] `twake mail send` command (compose from stdin)
- [ ] `twake drive sync` for local folder sync
- [ ] Tab completion for room names and mailboxes
- [ ] `twake pipe` — pipe output between services (e.g. mail attachment → drive)
- [ ] MCP server mode for AI assistant integration

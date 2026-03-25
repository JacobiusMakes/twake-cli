# twake-cli

> Command-line interface for [Twake Workplace](https://linagora.com/en/twake-workplace) — chat, mail, drive, and file sharing from your terminal.

A unified CLI for interacting with Linagora's open-source collaboration suite. Built on the open protocols that power Twake Workplace:

- **Twake Chat** via the [Matrix](https://matrix.org) client-server API
- **Twake Mail** via [JMAP](https://jmap.io) (RFC 8620/8621)
- **Twake Drive** via the [Cozy](https://cozy.io) API
- **LinShare** via the LinShare REST API

## Why?

Every major collaboration platform has a CLI — Slack, GitHub, Vercel, AWS. Twake Workplace deserves one too. `twake-cli` gives developers and power users terminal-native access to the entire Twake ecosystem, and enables scripting, automation, and CI/CD integration with open-source collaboration tools.

## Install

```bash
npm install -g @linagora/twake-cli
```

Or clone and link locally:

```bash
git clone https://github.com/jacob/twake-cli.git
cd twake-cli
npm install
npm link
```

Requires Node.js >= 18.

## Quick start

```bash
# Connect your services
twake auth login

# Check what's connected
twake status

# Send a chat message
twake chat send '#general:twake.app' "Hello from the terminal!"

# Check your inbox
twake mail inbox

# Upload a file
twake drive upload ./report.pdf

# Share a file with someone
twake share send ./contract.pdf --to partner@company.com --expires 7d

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

## Architecture

```
twake-cli/
├── bin/twake.js          # Entry point & command routing
├── src/
│   ├── config.js         # Config manager (~/.config/twake-cli/)
│   └── commands/
│       ├── auth.js       # Auth setup & credential management
│       ├── chat.js       # Matrix client-server API
│       ├── mail.js       # JMAP protocol implementation
│       ├── drive.js      # Cozy API for file management
│       ├── share.js      # LinShare REST API
│       ├── search.js     # Unified cross-product search
│       └── status.js     # Connection status overview
└── package.json
```

Each command module is self-contained with its own API client, making it easy to add new services or swap implementations.

## Open source

Licensed under AGPL-3.0 to match Linagora's licensing. Contributions welcome.

Built with admiration for Linagora's mission of digital sovereignty and open-source collaboration tools for Europe.

## Roadmap

- [ ] `twake chat send` with file attachments
- [ ] `twake mail send` command (compose from stdin)
- [ ] `twake drive sync` for local folder sync
- [ ] Tab completion for room names and mailboxes
- [ ] `twake pipe` — pipe output between services (e.g. mail attachment → drive)
- [ ] MCP server mode for AI assistant integration

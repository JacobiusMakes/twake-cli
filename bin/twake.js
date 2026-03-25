#!/usr/bin/env node

/**
 * twake-cli — Command-line interface for Twake Workplace
 * 
 * A unified CLI for interacting with Linagora's open-source
 * collaboration suite: Twake Chat (Matrix), Twake Mail (JMAP),
 * Twake Drive (Cozy), and LinShare.
 * 
 * License: AGPL-3.0 (matching Linagora's licensing)
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import subcommands
import { chatCommand } from '../src/commands/chat.js';
import { mailCommand } from '../src/commands/mail.js';
import { driveCommand } from '../src/commands/drive.js';
import { shareCommand } from '../src/commands/share.js';
import { authCommand } from '../src/commands/auth.js';
import { searchCommand } from '../src/commands/search.js';
import { statusCommand } from '../src/commands/status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('twake')
  .description('CLI for Twake Workplace — chat, mail, drive & share from your terminal')
  .version(pkg.version);

// Authentication & config
program.addCommand(authCommand());

// Status overview
program.addCommand(statusCommand());

// Twake Chat (Matrix protocol)
program.addCommand(chatCommand());

// Twake Mail (JMAP protocol)
program.addCommand(mailCommand());

// Twake Drive (Cozy API)
program.addCommand(driveCommand());

// LinShare (REST API)
program.addCommand(shareCommand());

// Unified search across all products
program.addCommand(searchCommand());

// Catch unhandled errors and display user-friendly messages
process.on('uncaughtException', (err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error(`\nError: ${err.message || err}`);
  process.exit(1);
});

program.parse();

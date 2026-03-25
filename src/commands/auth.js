/**
 * twake auth — Configure connections to Twake Workplace services
 * 
 * Usage:
 *   twake auth login          Interactive setup for all services
 *   twake auth login --chat   Configure only Twake Chat (Matrix)
 *   twake auth login --mail   Configure only Twake Mail (JMAP)
 *   twake auth login --drive  Configure only Twake Drive (Cozy)
 *   twake auth login --share  Configure only LinShare
 *   twake auth logout         Clear all stored credentials
 *   twake auth whoami         Show current auth status
 */

import { Command } from 'commander';
import { setServiceConfig, clearServiceConfig, isServiceConfigured, getServiceConfig, getConfigPath } from '../config.js';

export function authCommand() {
  const auth = new Command('auth')
    .description('Manage authentication for Twake Workplace services');

  auth
    .command('login')
    .description('Configure service connections')
    .option('--chat', 'Configure Twake Chat (Matrix) only')
    .option('--mail', 'Configure Twake Mail (JMAP) only')
    .option('--drive', 'Configure Twake Drive (Cozy) only')
    .option('--share', 'Configure LinShare only')
    .option('--homeserver <url>', 'Matrix homeserver URL')
    .option('--token <token>', 'Access/bearer token')
    .option('--user <userId>', 'User ID (e.g. @user:matrix.example.com)')
    .option('--url <url>', 'Service base URL')
    .action(async (opts) => {
      // Determine which services to configure
      const configureAll = !opts.chat && !opts.mail && !opts.drive && !opts.share;

      if (opts.chat || configureAll) {
        await configureMatrix(opts);
      }
      if (opts.mail || configureAll) {
        await configureJmap(opts);
      }
      if (opts.drive || configureAll) {
        await configureCozy(opts);
      }
      if (opts.share || configureAll) {
        await configureLinshare(opts);
      }

      console.log(`\nConfig saved to ${getConfigPath()}`);
    });

  auth
    .command('logout')
    .description('Clear all stored credentials')
    .option('--chat', 'Clear Twake Chat only')
    .option('--mail', 'Clear Twake Mail only')
    .option('--drive', 'Clear Twake Drive only')
    .option('--share', 'Clear LinShare only')
    .action((opts) => {
      const clearAll = !opts.chat && !opts.mail && !opts.drive && !opts.share;

      if (opts.chat || clearAll) { clearServiceConfig('matrix'); console.log('Cleared Twake Chat credentials'); }
      if (opts.mail || clearAll) { clearServiceConfig('jmap'); console.log('Cleared Twake Mail credentials'); }
      if (opts.drive || clearAll) { clearServiceConfig('cozy'); console.log('Cleared Twake Drive credentials'); }
      if (opts.share || clearAll) { clearServiceConfig('linshare'); console.log('Cleared LinShare credentials'); }
    });

  auth
    .command('whoami')
    .description('Show current authentication status')
    .action(() => {
      const services = [
        { name: 'Twake Chat', key: 'matrix', detail: () => getServiceConfig('matrix')?.userId || 'unknown user' },
        { name: 'Twake Mail', key: 'jmap', detail: () => getServiceConfig('jmap')?.sessionUrl || 'unknown server' },
        { name: 'Twake Drive', key: 'cozy', detail: () => getServiceConfig('cozy')?.instanceUrl || 'unknown instance' },
        { name: 'LinShare', key: 'linshare', detail: () => getServiceConfig('linshare')?.username || 'unknown user' },
      ];

      console.log('Twake CLI — Service connections:\n');

      for (const svc of services) {
        const connected = isServiceConfigured(svc.key);
        const icon = connected ? '\u2713' : '\u2717';
        const status = connected ? `connected (${svc.detail()})` : 'not configured';
        console.log(`  ${icon} ${svc.name.padEnd(14)} ${status}`);
      }

      console.log(`\nConfig: ${getConfigPath()}`);
    });

  return auth;
}

async function configureMatrix(opts) {
  // In non-interactive mode, use flags directly
  if (opts.homeserver && opts.token) {
    setServiceConfig('matrix', {
      homeserver: opts.homeserver,
      accessToken: opts.token,
      userId: opts.user || '',
    });
    console.log(`Twake Chat: connected to ${opts.homeserver}`);
    return;
  }

  // Interactive mode — dynamic import enquirer only when needed
  const { default: Enquirer } = await import('enquirer');
  const prompt = Enquirer.prompt.bind(Enquirer);

  console.log('\n--- Twake Chat (Matrix) ---');
  console.log('Get your access token from Twake Chat settings or Element.\n');

  const answers = await prompt([
    {
      type: 'input',
      name: 'homeserver',
      message: 'Matrix homeserver URL',
      initial: 'https://matrix.twake.app',
    },
    {
      type: 'input',
      name: 'userId',
      message: 'Your Matrix user ID',
      initial: '@you:twake.app',
    },
    {
      type: 'password',
      name: 'accessToken',
      message: 'Access token',
    },
  ]);

  setServiceConfig('matrix', answers);
  console.log(`Twake Chat: connected as ${answers.userId}`);
}

async function configureJmap(opts) {
  if (opts.url && opts.token) {
    setServiceConfig('jmap', {
      sessionUrl: opts.url,
      bearerToken: opts.token,
    });
    console.log(`Twake Mail: connected to ${opts.url}`);
    return;
  }

  const { default: Enquirer } = await import('enquirer');
  const prompt = Enquirer.prompt.bind(Enquirer);

  console.log('\n--- Twake Mail (JMAP) ---');
  console.log('JMAP session URL is typically: https://your-twake.example.com/.well-known/jmap\n');

  const answers = await prompt([
    {
      type: 'input',
      name: 'sessionUrl',
      message: 'JMAP session URL',
      initial: 'https://jmap.twake.app/.well-known/jmap',
    },
    {
      type: 'password',
      name: 'bearerToken',
      message: 'Bearer token',
    },
  ]);

  setServiceConfig('jmap', answers);
  console.log('Twake Mail: connected');
}

async function configureCozy(opts) {
  if (opts.url && opts.token) {
    setServiceConfig('cozy', {
      instanceUrl: opts.url,
      token: opts.token,
    });
    console.log(`Twake Drive: connected to ${opts.url}`);
    return;
  }

  const { default: Enquirer } = await import('enquirer');
  const prompt = Enquirer.prompt.bind(Enquirer);

  console.log('\n--- Twake Drive (Cozy) ---\n');

  const answers = await prompt([
    {
      type: 'input',
      name: 'instanceUrl',
      message: 'Cozy instance URL',
      initial: 'https://you.twake.app',
    },
    {
      type: 'password',
      name: 'token',
      message: 'OAuth token',
    },
  ]);

  setServiceConfig('cozy', answers);
  console.log('Twake Drive: connected');
}

async function configureLinshare(opts) {
  if (opts.url && opts.token) {
    setServiceConfig('linshare', {
      baseUrl: opts.url,
      jwt: opts.token,
    });
    console.log(`LinShare: connected to ${opts.url}`);
    return;
  }

  const { default: Enquirer } = await import('enquirer');
  const prompt = Enquirer.prompt.bind(Enquirer);

  console.log('\n--- LinShare ---\n');

  const answers = await prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'LinShare API base URL',
      initial: 'https://linshare.example.com/linshare/webservice/rest',
    },
    {
      type: 'input',
      name: 'username',
      message: 'Username (email)',
    },
    {
      type: 'password',
      name: 'jwt',
      message: 'JWT token',
    },
  ]);

  setServiceConfig('linshare', answers);
  console.log(`LinShare: connected as ${answers.username}`);
}

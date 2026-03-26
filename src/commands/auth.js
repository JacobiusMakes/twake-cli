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
import { createServer } from 'http';
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
  // Direct token mode (CI/scripting fallback)
  if (opts.homeserver && opts.token) {
    setServiceConfig('matrix', {
      homeserver: opts.homeserver,
      accessToken: opts.token,
      userId: opts.user || '',
    });
    console.log(`Twake Chat: connected to ${opts.homeserver}`);
    return;
  }

  const { default: Enquirer } = await import('enquirer');
  const prompt = Enquirer.prompt.bind(Enquirer);

  console.log('\n--- Twake Chat (Matrix) ---\n');

  const { homeserver } = await prompt([
    {
      type: 'input',
      name: 'homeserver',
      message: 'Matrix homeserver URL',
      initial: 'https://matrix.twake.app',
    },
  ]);

  // Start local server to receive SSO callback
  const port = 8932;
  const redirectUrl = `http://localhost:${port}/callback`;

  const loginToken = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('loginToken');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>twake-cli</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
background:#0d1117;color:#e6edf3}
.card{text-align:center;padding:3rem;border-radius:16px;
background:linear-gradient(145deg,#161b22,#1c2333);
border:1px solid #30363d;box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:420px}
.check{width:64px;height:64px;margin:0 auto 1.5rem;border-radius:50%;
background:#238636;display:flex;align-items:center;justify-content:center;
animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
.check svg{width:32px;height:32px}
h1{font-size:1.5rem;font-weight:600;margin-bottom:.5rem}
p{color:#8b949e;line-height:1.6}
.closing{margin-top:1.5rem;font-size:.85rem;color:#58a6ff}
@keyframes pop{0%{transform:scale(0)}100%{transform:scale(1)}}
</style></head><body>
<div class="card">
<div class="check"><svg fill="none" stroke="#fff" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
<h1>Logged in to twake-cli</h1>
<p>You're authenticated. Return to your terminal.</p>
<p class="closing">You can close this tab now.</p>
</div>
</body></html>`);
        server.close();

        if (token) {
          resolve(token);
        } else {
          reject(new Error('No loginToken received from SSO callback'));
        }
      }
    });

    server.listen(port, () => {
      const ssoUrl = `${homeserver}/_matrix/client/v3/login/sso/redirect/oidc-twake?redirectUrl=${encodeURIComponent(redirectUrl)}`;

      console.log('Opening browser for Twake SSO login...');
      console.log(`If it doesn't open, go to:\n  ${ssoUrl}\n`);

      // Open browser (macOS)
      import('child_process').then(({ exec }) => {
        exec(`open "${ssoUrl}"`);
      });
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('SSO login timed out after 2 minutes'));
    }, 120000);
  });

  // Exchange login token for access token
  const res = await fetch(`${homeserver}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.token',
      token: loginToken,
      initial_device_display_name: 'twake-cli',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error || res.statusText}`);
  }

  const data = await res.json();

  setServiceConfig('matrix', {
    homeserver,
    accessToken: data.access_token,
    userId: data.user_id,
    deviceId: data.device_id,
  });

  console.log(`Twake Chat: logged in as ${data.user_id} (device: ${data.device_id})`);
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
  // Direct token mode (CI/scripting fallback)
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

  console.log('\n--- Twake Drive (Cozy OAuth) ---\n');

  const { instanceUrl } = await prompt([
    {
      type: 'input',
      name: 'instanceUrl',
      message: 'Cozy instance URL',
      initial: 'https://jacob.twake.app',
    },
  ]);

  const port = 8933;
  const redirectUri = `http://localhost:${port}/callback`;

  // Step 1: Register OAuth client with the Cozy instance
  console.log('Registering twake-cli with your Cozy instance...');

  const regRes = await fetch(`${instanceUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_name: 'twake-cli',
      client_kind: 'CLI',
      client_uri: 'https://github.com/JacobiusMakes/twake-cli',
      redirect_uris: [redirectUri],
      software_id: 'io.github.jacobiumakes.twake-cli',
    }),
  });

  if (!regRes.ok) {
    const err = await regRes.text().catch(() => '');
    throw new Error(`OAuth registration failed: ${regRes.status} ${err}`);
  }

  const client = await regRes.json();
  const clientId = client.client_id;
  const clientSecret = client.client_secret;

  // Step 2: Open browser for authorization
  const scope = 'io.cozy.files io.cozy.files.metadata';
  const state = Math.random().toString(36).slice(2);

  const authCode = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>twake-cli</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
background:#0d1117;color:#e6edf3}
.card{text-align:center;padding:3rem;border-radius:16px;
background:linear-gradient(145deg,#161b22,#1c2333);
border:1px solid #30363d;box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:420px}
.check{width:64px;height:64px;margin:0 auto 1.5rem;border-radius:50%;
background:#238636;display:flex;align-items:center;justify-content:center;
animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
.check svg{width:32px;height:32px}
h1{font-size:1.5rem;font-weight:600;margin-bottom:.5rem}
p{color:#8b949e;line-height:1.6}
.closing{margin-top:1.5rem;font-size:.85rem;color:#58a6ff}
@keyframes pop{0%{transform:scale(0)}100%{transform:scale(1)}}
</style></head><body>
<div class="card">
<div class="check"><svg fill="none" stroke="#fff" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
<h1>Twake Drive connected</h1>
<p>twake-cli can now access your files. Return to your terminal.</p>
<p class="closing">You can close this tab now.</p>
</div></body></html>`);
        server.close();

        if (code && returnedState === state) {
          resolve(code);
        } else {
          reject(new Error('OAuth callback missing code or state mismatch'));
        }
      }
    });

    server.listen(port, () => {
      const authUrl = `${instanceUrl}/auth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

      console.log('Opening browser for Twake Drive authorization...');
      console.log(`If it doesn't open, go to:\n  ${authUrl}\n`);

      import('child_process').then(({ exec }) => {
        exec(`open "${authUrl}"`);
      });
    });

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth authorization timed out after 2 minutes'));
    }, 120000);
  });

  // Step 3: Exchange auth code for access token
  const tokenRes = await fetch(`${instanceUrl}/auth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => '');
    throw new Error(`Token exchange failed: ${tokenRes.status} ${err}`);
  }

  const tokenData = await tokenRes.json();

  setServiceConfig('cozy', {
    instanceUrl,
    token: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    clientId,
    clientSecret,
  });

  console.log('Twake Drive: connected via OAuth');
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

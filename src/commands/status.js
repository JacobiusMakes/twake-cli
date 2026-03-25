/**
 * twake status — Quick overview of connected services
 */

import { Command } from 'commander';
import { isServiceConfigured, getServiceConfig, getConfigPath } from '../config.js';

export function statusCommand() {
  const status = new Command('status')
    .description('Show connection status for all Twake services')
    .action(async () => {
      console.log('twake-cli v0.1.0\n');

      const services = [
        { name: 'Chat',  key: 'matrix',   protocol: 'Matrix',   urlKey: 'homeserver' },
        { name: 'Mail',  key: 'jmap',     protocol: 'JMAP',     urlKey: 'sessionUrl' },
        { name: 'Drive', key: 'cozy',     protocol: 'Cozy API', urlKey: 'instanceUrl' },
        { name: 'Share', key: 'linshare', protocol: 'REST',     urlKey: 'baseUrl' },
      ];

      let anyConnected = false;

      for (const svc of services) {
        const connected = isServiceConfigured(svc.key);
        const icon = connected ? '\x1b[32m\u2713\x1b[0m' : '\x1b[90m\u2717\x1b[0m';

        if (connected) {
          anyConnected = true;
          const cfg = getServiceConfig(svc.key);
          const url = cfg[svc.urlKey] || '';
          console.log(`  ${icon} Twake ${svc.name.padEnd(6)} ${svc.protocol.padEnd(10)} ${url}`);
        } else {
          console.log(`  ${icon} Twake ${svc.name.padEnd(6)} not connected`);
        }
      }

      console.log('');

      if (!anyConnected) {
        console.log('  Get started: twake auth login');
      } else {
        console.log('  Try: twake search "hello"');
      }

      console.log(`\n  Config: ${getConfigPath()}`);
    });

  return status;
}

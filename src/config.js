/**
 * Configuration manager for twake-cli
 * 
 * Stores auth tokens and server URLs in ~/.config/twake-cli/config.json
 * Uses the `conf` package for cross-platform config storage.
 * 
 * Supports multiple service connections:
 * - matrix: Twake Chat (homeserver URL + access token)
 * - jmap: Twake Mail (session URL + bearer token)  
 * - cozy: Twake Drive (instance URL + token)
 * - linshare: LinShare (base URL + JWT)
 */

import Conf from 'conf';
import { chmodSync } from 'fs';

const schema = {
  matrix: {
    type: 'object',
    properties: {
      homeserver: { type: 'string' },
      accessToken: { type: 'string' },
      userId: { type: 'string' },
    },
    default: {},
  },
  jmap: {
    type: 'object',
    properties: {
      sessionUrl: { type: 'string' },
      bearerToken: { type: 'string' },
      accountId: { type: 'string' },
    },
    default: {},
  },
  cozy: {
    type: 'object',
    properties: {
      instanceUrl: { type: 'string' },
      token: { type: 'string' },
    },
    default: {},
  },
  linshare: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string' },
      jwt: { type: 'string' },
      username: { type: 'string' },
    },
    default: {},
  },
};

const config = new Conf({
  projectName: 'twake-cli',
  schema,
});

export function getServiceConfig(service) {
  return config.get(service);
}

/**
 * SECURITY: Lock down config file permissions after every write.
 *
 * config.json stores tokens in plaintext. Setting mode 0600
 * (owner read/write only) prevents other users on the same
 * machine from reading credentials.
 */
function lockConfigFile() {
  try {
    chmodSync(config.path, 0o600);
  } catch {
    // Non-fatal — might fail on Windows where POSIX perms don't apply.
    // On Unix systems this should always succeed.
  }
}

export function setServiceConfig(service, values) {
  const current = config.get(service) || {};
  config.set(service, { ...current, ...values });
  lockConfigFile(); // SECURITY: restrict file permissions after write
}

export function clearServiceConfig(service) {
  config.set(service, {});
  lockConfigFile(); // SECURITY: restrict file permissions after write
}

export function isServiceConfigured(service) {
  const cfg = config.get(service);
  if (!cfg) return false;

  switch (service) {
    case 'matrix':
      return !!(cfg.homeserver && cfg.accessToken);
    case 'jmap':
      return !!(cfg.sessionUrl && cfg.bearerToken);
    case 'cozy':
      return !!(cfg.instanceUrl && cfg.token);
    case 'linshare':
      return !!(cfg.baseUrl && cfg.jwt);
    default:
      return false;
  }
}

export function getConfigPath() {
  return config.path;
}

export default config;

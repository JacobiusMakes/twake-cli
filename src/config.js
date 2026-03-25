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

export function setServiceConfig(service, values) {
  const current = config.get(service) || {};
  config.set(service, { ...current, ...values });
}

export function clearServiceConfig(service) {
  config.set(service, {});
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

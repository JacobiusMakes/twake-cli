/**
 * Security utilities for twake-cli
 *
 * Centralizes token redaction, URL validation, room-ID validation,
 * and the custom User-Agent header so every command file can reuse
 * the same hardened helpers.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { timingSafeEqual } from 'crypto';

// ---------- package version (for User-Agent) ----------

const __dirname = dirname(fileURLToPath(import.meta.url));
let pkgVersion = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  pkgVersion = pkg.version || pkgVersion;
} catch { /* graceful fallback */ }

/**
 * SECURITY: Custom User-Agent sent with every outgoing HTTP request.
 * Identifies twake-cli to servers and proxies, which is standard
 * practice for API clients and helps with audit logging.
 */
export const USER_AGENT = `twake-cli/${pkgVersion} (Node.js ${process.version})`;

// ---------- token redaction ----------

/**
 * SECURITY: Redact tokens / secrets from arbitrary strings before logging.
 *
 * Matches common token-like patterns (Bearer tokens, long hex/base64
 * strings, JWT-shaped values) and replaces them with [REDACTED].
 * This prevents accidental credential leakage in console output.
 */
const TOKEN_PATTERNS = [
  // Bearer <token> in any casing
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // JWT-shaped: three base64url segments separated by dots
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Long hex strings (32+ chars) that look like tokens
  /[0-9a-f]{32,}/gi,
  // Long base64-like strings (40+ chars) that look like tokens
  /[A-Za-z0-9+/]{40,}={0,3}/g,
  // Matrix access tokens (syt_ prefix)
  /syt_[A-Za-z0-9_\-/.]+/g,
];

export function redactTokens(str) {
  if (typeof str !== 'string') return str;
  let redacted = str;
  for (const pattern of TOKEN_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * SECURITY: Safe error logging — redacts tokens before writing to stderr.
 * All command files should use this instead of raw console.error when
 * the message might contain server responses or token values.
 */
export function safeError(msg) {
  console.error(redactTokens(String(msg)));
}

// ---------- URL validation ----------

/**
 * SECURITY: Validate that a URL is a well-formed HTTPS URL.
 *
 * Rejects http:// in production to prevent credentials from being sent
 * over unencrypted connections. Allows http://localhost for local
 * development and the SSO callback server only.
 *
 * @param {string} urlStr  — the URL to validate
 * @param {string} label   — human-readable label for error messages
 * @throws {Error} if the URL is invalid or uses plain HTTP in production
 */
export function validateHttpsUrl(urlStr, label = 'URL') {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error(`${label} is required and must be a non-empty string.`);
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`${label} is not a valid URL: ${urlStr}`);
  }

  // Allow http only for localhost (local dev / SSO callback)
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (parsed.protocol === 'http:' && !isLocalhost) {
    throw new Error(
      `${label} must use HTTPS in production (got ${urlStr}). ` +
      'Plain HTTP exposes credentials on the network.'
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} must use HTTPS (got protocol "${parsed.protocol}").`);
  }

  return parsed;
}

// ---------- Matrix room-ID validation ----------

/**
 * SECURITY: Validate that a Matrix room identifier has the expected format.
 *
 * Room IDs look like !abc123:server.example.com
 * Room aliases look like #engineering:server.example.com
 * Anything else is rejected to prevent injection or confusion.
 */
export function validateRoomId(room) {
  if (!room || typeof room !== 'string') {
    throw new Error('Room identifier is required.');
  }
  // Must start with ! (room ID) or # (room alias)
  if (!room.startsWith('!') && !room.startsWith('#')) {
    throw new Error(
      `Invalid room identifier "${room}". ` +
      'Room IDs must start with "!" and aliases must start with "#".'
    );
  }
  // Basic format: prefix + localpart + : + server
  const roomPattern = /^[!#][A-Za-z0-9._=\-/]+:[A-Za-z0-9.\-]+(:[0-9]+)?$/;
  if (!roomPattern.test(room)) {
    throw new Error(
      `Invalid room identifier format "${room}". ` +
      'Expected format: !localpart:server or #alias:server'
    );
  }
  return room;
}

// ---------- timing-safe string comparison ----------

/**
 * SECURITY: Constant-time string comparison to prevent timing attacks.
 *
 * Used for comparing OAuth state parameters. A naive === comparison
 * leaks information about how many leading bytes matched, which an
 * attacker can exploit to guess the state token one byte at a time.
 */
export function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // timingSafeEqual requires buffers of equal length
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

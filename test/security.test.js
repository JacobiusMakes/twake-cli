import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  redactTokens,
  validateHttpsUrl,
  validateRoomId,
  timingSafeCompare,
  USER_AGENT,
} from '../src/security.js';

// ── redactTokens ────────────────────────────────────────────────

describe('redactTokens()', () => {
  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer abc123XYZ.token_value';
    const result = redactTokens(input);
    assert.ok(!result.includes('abc123XYZ'), 'Bearer token value should be redacted');
    assert.ok(result.includes('[REDACTED]'));
  });

  it('redacts syt_ Matrix access tokens', () => {
    const input = 'token is syt_alice_OlRhS3VfSWVG_012ab';
    const result = redactTokens(input);
    assert.ok(!result.includes('syt_alice'), 'syt_ token should be redacted');
    assert.ok(result.includes('[REDACTED]'));
  });

  it('redacts JWT-shaped (eyJ...) tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123signature';
    const result = redactTokens(`login with ${jwt} please`);
    assert.ok(!result.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT should be redacted');
    assert.ok(result.includes('[REDACTED]'));
  });

  it('returns non-string values unchanged', () => {
    assert.strictEqual(redactTokens(42), 42);
    assert.strictEqual(redactTokens(null), null);
    assert.strictEqual(redactTokens(undefined), undefined);
  });

  it('leaves ordinary text untouched', () => {
    const plain = 'hello world';
    assert.strictEqual(redactTokens(plain), plain);
  });
});

// ── validateHttpsUrl ────────────────────────────────────────────

describe('validateHttpsUrl()', () => {
  it('accepts a valid https URL and returns a URL object', () => {
    const result = validateHttpsUrl('https://matrix.example.com');
    assert.ok(result instanceof URL);
    assert.strictEqual(result.protocol, 'https:');
  });

  it('rejects a plain http URL (non-localhost)', () => {
    assert.throws(
      () => validateHttpsUrl('http://matrix.example.com'),
      /HTTPS/i,
    );
  });

  it('allows http://localhost for local development', () => {
    const result = validateHttpsUrl('http://localhost:8080');
    assert.strictEqual(result.hostname, 'localhost');
  });

  it('rejects non-URL strings', () => {
    assert.throws(
      () => validateHttpsUrl('not-a-url'),
      /not a valid URL/i,
    );
  });

  it('rejects empty / missing input', () => {
    assert.throws(() => validateHttpsUrl(''), /required/i);
    assert.throws(() => validateHttpsUrl(null), /required/i);
  });

  it('rejects non-http(s) protocols like ftp:', () => {
    assert.throws(
      () => validateHttpsUrl('ftp://files.example.com'),
      /HTTPS/i,
    );
  });
});

// ── validateRoomId ──────────────────────────────────────────────

describe('validateRoomId()', () => {
  it('accepts a valid room ID starting with !', () => {
    const result = validateRoomId('!abc123:matrix.example.com');
    assert.strictEqual(result, '!abc123:matrix.example.com');
  });

  it('accepts a valid room alias starting with #', () => {
    const result = validateRoomId('#engineering:matrix.example.com');
    assert.strictEqual(result, '#engineering:matrix.example.com');
  });

  it('rejects a room ID without ! or # prefix', () => {
    assert.throws(
      () => validateRoomId('abc123:matrix.example.com'),
      /must start with/i,
    );
  });

  it('rejects empty / missing input', () => {
    assert.throws(() => validateRoomId(''), /required/i);
    assert.throws(() => validateRoomId(null), /required/i);
  });

  it('rejects malformed room IDs (no server part)', () => {
    assert.throws(
      () => validateRoomId('!missingserver'),
      /Invalid room identifier format/i,
    );
  });
});

// ── timingSafeCompare ───────────────────────────────────────────

describe('timingSafeCompare()', () => {
  it('returns true for identical strings', () => {
    assert.strictEqual(timingSafeCompare('secret', 'secret'), true);
  });

  it('returns false for different strings of the same length', () => {
    assert.strictEqual(timingSafeCompare('aaaaaa', 'bbbbbb'), false);
  });

  it('returns false for strings of different lengths', () => {
    assert.strictEqual(timingSafeCompare('short', 'longer-string'), false);
  });

  it('returns false when either argument is not a string', () => {
    assert.strictEqual(timingSafeCompare(123, 'abc'), false);
    assert.strictEqual(timingSafeCompare('abc', null), false);
  });
});

// ── USER_AGENT ──────────────────────────────────────────────────

describe('USER_AGENT', () => {
  it('is a non-empty string', () => {
    assert.strictEqual(typeof USER_AGENT, 'string');
    assert.ok(USER_AGENT.length > 0);
  });

  it('contains "twake-cli"', () => {
    assert.ok(USER_AGENT.includes('twake-cli'));
  });
});

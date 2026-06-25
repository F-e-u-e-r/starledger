import { TerminalError } from '@starred/github-client';
import { describe, expect, it } from 'vitest';
import { resolveRetryConfig } from '../src/config';

describe('resolveRetryConfig', () => {
  it('returns no override when the env var is unset (library default applies)', () => {
    expect(resolveRetryConfig({})).toEqual({});
  });

  it('returns no override for an empty/whitespace value', () => {
    expect(resolveRetryConfig({ STARLEDGER_RETRY_MAX_TOTAL_WAIT_MS: '   ' })).toEqual({});
  });

  it('parses a positive integer of milliseconds', () => {
    expect(resolveRetryConfig({ STARLEDGER_RETRY_MAX_TOTAL_WAIT_MS: '600000' })).toEqual({
      maxTotalWaitMs: 600_000,
    });
  });

  it.each(['0', '-1', 'abc', '300.5', 'NaN'])('fails closed on a malformed value: %s', (value) => {
    expect(() => resolveRetryConfig({ STARLEDGER_RETRY_MAX_TOTAL_WAIT_MS: value })).toThrow(
      TerminalError,
    );
  });

  it('surfaces the offending value and an INVALID_RETRY_BUDGET code', () => {
    const err = (() => {
      try {
        resolveRetryConfig({ STARLEDGER_RETRY_MAX_TOTAL_WAIT_MS: 'nope' });
        return null;
      } catch (e) {
        return e as TerminalError;
      }
    })();
    expect(err).toBeInstanceOf(TerminalError);
    expect(err?.code).toBe('INVALID_RETRY_BUDGET');
    expect(err?.message).toContain('nope');
  });
});

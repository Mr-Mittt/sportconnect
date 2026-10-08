import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { getChatActionFailureKind, getChatLoadFailure, getChatSendFailure } from './chatErrors';

function http(status: number, data: unknown = 'text'): AxiosError {
  const error = new AxiosError('failed', 'ERR_BAD_RESPONSE');
  error.response = { status, data } as AxiosResponse;
  return error;
}

describe('chatErrors (CLIENT-ERR-9)', () => {
  it.each([
    [403, 'unavailable'],
    [404, 'unavailable'],
    [500, 'transient'],
    [400, 'transient'],
  ] as const)('getChatLoadFailure(%i) is %s', (status, expected) => {
    expect(getChatLoadFailure(http(status))).toBe(expected);
  });

  it('treats a response-less failure as transient everywhere', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(getChatLoadFailure(network)).toBe('transient');
    expect(getChatSendFailure(network)).toBe('transient');
    expect(getChatActionFailureKind(network)).toBe('failed');
  });

  it.each([
    [403, { error: 'forbidden', message: 'x' }, 'unavailable'],
    [404, 'not found', 'unavailable'],
    [400, { error: 'bad_request', message: 'x' }, 'invalid'],
    [503, 'text', 'transient'],
  ] as const)('getChatSendFailure(%i) is %s', (status, body, expected) => {
    expect(getChatSendFailure(http(status, body))).toBe(expected);
  });

  it.each([
    [403, 'notOwner'],
    [404, 'gone'],
    [500, 'failed'],
  ] as const)('getChatActionFailureKind(%i) is %s', (status, expected) => {
    expect(getChatActionFailureKind(http(status))).toBe(expected);
  });
});

import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { buildHttpLogMeta, httpLoggingMiddleware } from './http-logging.middleware';

function fakeReq(
  overrides: Partial<Record<string, unknown>> = {},
  headers: Record<string, string> = {},
) {
  return {
    method: 'POST',
    originalUrl: '/api/invoices/preview-data',
    ip: '1.2.3.4',
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as unknown as Request;
}

function fakeRes(statusCode = 200) {
  const emitter = new EventEmitter() as EventEmitter & {
    statusCode: number;
    writableFinished: boolean;
  };
  emitter.statusCode = statusCode;
  emitter.writableFinished = false;
  return emitter;
}

describe('httpLoggingMiddleware', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('tags the line with userId, platform and app version', () => {
    const req = fakeReq(
      { user: { userId: 'u_1' } },
      { 'x-app-platform': 'ios', 'x-app-version': '1.3' },
    );
    expect(buildHttpLogMeta(req)).toEqual({
      ip: '1.2.3.4',
      userId: 'u_1',
      platform: 'ios',
      appVersion: '1.3',
    });
  });

  it('clips oversized client headers', () => {
    const req = fakeReq({}, { 'x-app-version': 'x'.repeat(500) });
    expect(buildHttpLogMeta(req).appVersion).toHaveLength(32);
  });

  it('logs a completed request once, on finish', () => {
    const res = fakeRes(200);
    const next = jest.fn() as NextFunction;
    httpLoggingMiddleware(fakeReq(), res as unknown as Response, next);
    res.writableFinished = true;
    res.emit('finish');
    res.emit('close');
    expect(next).toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a request the client aborted before any response', () => {
    const res = fakeRes();
    httpLoggingMiddleware(fakeReq(), res as unknown as Response, jest.fn());
    res.emit('close');
    const [payload] = warn.mock.calls[0] as [{ message: string }];
    expect(payload.message).toMatch(/^POST \/api\/invoices\/preview-data ABORTED by client/);
  });
});

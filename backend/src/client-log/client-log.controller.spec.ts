import { Logger, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { ClientLogController } from './client-log.controller';
import { CreateClientLogDto } from './dto/create-client-log.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function validate(body: unknown): Promise<CreateClientLogDto> {
  return pipe.transform(body, {
    type: 'body',
    metatype: CreateClientLogDto,
  }) as Promise<CreateClientLogDto>;
}

describe('ClientLogController', () => {
  let warn: jest.SpyInstance;
  const controller = new ClientLogController();

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs one line per event, tagged with the authenticated user', async () => {
    const dto = await validate({
      platform: 'ios',
      appVersion: '1.3',
      events: [
        {
          kind: 'http_error',
          method: 'POST',
          url: '/api/invoices/preview-data',
          status: 0,
          message: 'Timeout',
          at: '2026-11-18T10:00:00.000Z',
        },
        { kind: 'session_check', message: 'resume: logged out', at: '2026-11-18T10:00:01.000Z' },
      ],
    });
    controller.report(dto, { user: { userId: 'u_1' } } as unknown as Request);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'http_error POST /api/invoices/preview-data status=0 — Timeout',
        userId: 'u_1',
        platform: 'ios',
      }),
    );
  });

  it('accepts anonymous reports', async () => {
    const dto = await validate({
      platform: 'android',
      events: [{ kind: 'session_check', at: '2026-11-18T10:00:00.000Z' }],
    });
    controller.report(dto, {} as Request);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ userId: undefined }));
  });

  it.each([
    ['unknown kind', { platform: 'ios', events: [{ kind: 'nope', at: '2026-11-18T10:00:00Z' }] }],
    [
      'unknown platform',
      { platform: 'tv', events: [{ kind: 'http_error', at: '2026-11-18T10:00:00Z' }] },
    ],
    ['empty batch', { platform: 'ios', events: [] }],
    [
      'oversized batch',
      {
        platform: 'ios',
        events: Array.from({ length: 21 }, () => ({
          kind: 'http_error',
          at: '2026-11-18T10:00:00Z',
        })),
      },
    ],
    [
      'extra field',
      { platform: 'ios', events: [{ kind: 'http_error', at: '2026-11-18T10:00:00Z', body: 'x' }] },
    ],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeDefined();
  });
});

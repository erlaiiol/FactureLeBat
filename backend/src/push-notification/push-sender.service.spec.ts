import { ConfigService } from '@nestjs/config';
import { PushSenderService } from './push-sender.service';
import { PushUnavailableError } from './push-unavailable.error';

function buildService(firebaseServiceAccountJson?: string): PushSenderService {
  const config = {
    get: jest.fn().mockReturnValue(firebaseServiceAccountJson),
  } as unknown as ConfigService;
  return new PushSenderService(config);
}

describe('PushSenderService', () => {
  it('reports unconfigured when FIREBASE_SERVICE_ACCOUNT_JSON is unset', () => {
    const service = buildService(undefined);
    expect(service.isConfigured()).toBe(false);
  });

  it('throws PushUnavailableError on send() when unconfigured, rather than crashing', async () => {
    const service = buildService(undefined);
    await expect(service.send(['token-1'], { title: 'x', body: 'y' })).rejects.toBeInstanceOf(
      PushUnavailableError,
    );
  });
});

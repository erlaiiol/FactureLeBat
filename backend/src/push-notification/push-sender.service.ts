import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PushUnavailableError } from './push-unavailable.error';

// Isolated from PushNotificationService on purpose, same "isolate the risky
// external boundary" split as StripeClientService/GroqClientService: this
// class only ever knows about the raw FCM send call. Both iOS and Android
// route through FCM exclusively — @capacitor-community/fcm makes the iOS
// app register an FCM token too (Firebase bridges the raw APNs token
// internally), so there is only ever one token shape/one vendor SDK to
// deal with here, not a second direct-APNs code path for zero functional
// gain. FIREBASE_SERVICE_ACCOUNT_JSON is optional like GROQ_API_KEY/
// STRIPE_SECRET_KEY: the app boots fine unset, every method here just
// throws PushUnavailableError until it's configured.
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);
  private readonly app?: App;

  constructor(config: ConfigService) {
    const encoded = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!encoded) {
      this.app = undefined;
      return;
    }
    const credentialsJson = Buffer.from(encoded, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(credentialsJson) as ServiceAccount;
    this.app = initializeApp({ credential: cert(serviceAccount) }, 'push-notification');
  }

  isConfigured(): boolean {
    return Boolean(this.app);
  }

  // One bundled message fanned out to every token in one FCM call — the
  // caller (ReminderCronService/PushNotificationService.sendTest) decides
  // how many tokens and what the digest copy says; this method has no
  // per-invoice/per-artisan business knowledge at all.
  async send(tokens: string[], payload: { title: string; body: string }): Promise<void> {
    if (!this.app) {
      throw new PushUnavailableError('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
    }
    if (tokens.length === 0) {
      return;
    }

    const response = await getMessaging(this.app).sendEachForMulticast({
      tokens,
      notification: payload,
    });

    if (response.failureCount > 0) {
      this.logger.warn(
        `${response.failureCount}/${tokens.length} push notification(s) failed to send`,
      );
    }
  }
}

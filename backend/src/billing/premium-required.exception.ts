import { HttpException, HttpStatus } from '@nestjs/common';

// Thrown by PremiumGateService when a company has already used its one free
// invoice and holds no active subscription/premium grant. 402 Payment
// Required is the one HTTP status that says exactly this — the frontend
// checks specifically for this status (see paywall.service.ts) to show the
// paywall instead of a generic error, so both the status code and the
// `error` discriminator below are part of the contract, not incidental.
export class PremiumRequiredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'PremiumRequired',
        message:
          'Votre facture gratuite a déjà été utilisée. Un abonnement est nécessaire pour en créer une nouvelle.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

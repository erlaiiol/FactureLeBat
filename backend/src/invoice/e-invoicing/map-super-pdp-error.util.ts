import { ServiceUnavailableException } from '@nestjs/common';
import { SuperPdpUnavailableError } from './super-pdp-unavailable.error';

// Same "one error type, one generic client-facing message" posture as
// billing.controller.ts's own mapStripeError — SuperPdpUnavailableError
// covers both "not configured on this deployment" and "this company hasn't
// connected SUPER PDP yet" (see CompanySuperPdpService.getValidAccessToken),
// neither of which the artisan needs a raw stack trace for.
export function mapSuperPdpError(error: unknown): unknown {
  if (error instanceof SuperPdpUnavailableError) {
    return new ServiceUnavailableException(
      "La transmission via une plateforme agréée n'est pas configurée ou n'est pas connectée pour cette entreprise.",
    );
  }
  return error;
}

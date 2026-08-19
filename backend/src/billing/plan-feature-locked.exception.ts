import { HttpException, HttpStatus } from '@nestjs/common';
import { GatedFeature } from './plan-config';

const FEATURE_MESSAGES: Record<GatedFeature, string> = {
  analytics: "Les statistiques d'activité ne sont pas incluses dans votre offre actuelle.",
  aiSourcing: "L'assistant IA fournisseurs n'est pas inclus dans votre offre actuelle.",
  dossiers: 'Les dossiers ne sont pas inclus dans votre offre actuelle.',
};

// Thrown by PlanGateService.assertFeatureAccess for a feature the
// company's current tier doesn't include (Phase 17 analytics, Phase 10 AI
// assistant) — see docs/roadmap.md Phase 30. Same "distinct discriminator
// so the shared 402 interceptor doesn't fire the wrong modal" reasoning as
// CatalogLimitExceededException.
export class PlanFeatureLockedException extends HttpException {
  constructor(feature: GatedFeature) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'PlanFeatureLocked',
        message: FEATURE_MESSAGES[feature],
        feature,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

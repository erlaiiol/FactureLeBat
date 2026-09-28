// `make prod` (see Makefile, infra/playstore-demo-seed.sh) — creates one real
// account in the PRODUCTION database, logged into through the app's normal
// email/password form, so it can be handed to Google Play Console's "app
// access" reviewer-credentials field (Play's pre-launch review requires a
// working login, not just an install). Apple's App Review has the same
// requirement for the App Store side.
//
// Deliberately NOT the same thing as `make demo`/DEMO_PROFILES
// (backend/src/auth/demo.constants.ts, backend/prisma/seed-demo.ts): that
// stack's one-click "Démo — accès en un clic" buttons only render when
// DEMO_MODE=true, which infra/docker-compose.prod.yml never sets — turning
// that on in production would let anyone log into a demo tenant with no
// password at all. A store reviewer instead types this account's email and
// password into the same login form a real artisan uses.
//
// Idempotent by design, but unlike seed-demo.ts this does NOT wipe and
// recreate on every run: it's a real row in the production database, and a
// reviewer may be mid-session (Google's automated pre-launch crawler, or a
// human reviewer clicking around) when a redeploy happens. If the account
// already exists, this is a no-op; it only ever creates once, the first time
// `make prod` seeds a fresh database.
//
// Also seeds a second, App Store-specific account (APPSTORE_SANDBOX_EMAIL)
// for Apple's review of the native In-App Purchase flow (docs/1.7/). Two
// deliberate differences from the Play Store one:
// - NO Premium grant: the reviewer must reach the paywall and complete a
//   sandbox purchase — an account that's already Premium hides the very
//   IAP Apple is reviewing (Guideline 2.1 "unable to locate the IAP").
// - Its password is never committed (this repo is public): it's read from
//   APPSTORE_SANDBOX_PASSWORD in infra/.env (reaches this container via
//   docker-compose.prod.yml's env_file). Unset → that account is skipped
//   with a warning, never a failed `make prod`. Changing the env value
//   re-syncs the stored hash on the next run, so rotating it is just
//   "edit infra/.env, make prod, update App Store Connect".
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateReferralCode } from '../src/referral/referral-code-generator.util';
import { PrismaClient } from '../generated/prisma/client';
import {
  ActivityCategory,
  DocumentType,
  InvoiceStatus,
  LegalStatus,
  PlanTier,
  ServicePricingMode,
  ServiceVisibility,
  Unit,
  UserRole,
} from '../generated/prisma/enums';

// Mirror backend/src/auth/auth.constants.ts (see seed-demo.ts's own copy of
// this comment) — kept as a fixed, documented credential rather than an
// infra/.env-configurable one: it's meant to be typed verbatim into Play
// Console/App Store Connect once, not rotated per deployment.
const BCRYPT_SALT_ROUNDS = 12;
const CURRENT_TERMS_VERSION = '1.0';

const PLAYSTORE_DEMO_EMAIL = 'store-review@facturele.app';
const PLAYSTORE_DEMO_PASSWORD = 'StoreReview2026!';

const APPSTORE_SANDBOX_EMAIL = 'appstore-sandbox@facturele.app';

// Same "outside Stripe, never hits the paywall" mechanism as seed-demo.ts —
// see PlanGateService.getEffectivePlanTier. A reviewer must see every
// Premium-only screen (AI assistant, analytics) without hitting a paywall.
const PREMIUM_GRANTED_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: mustGetEnv('DATABASE_URL') }),
});

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`seed-playstore-demo: missing required env var ${name}`);
  }
  return value;
}

interface ReviewerAccount {
  email: string;
  password: string;
  companyName: string;
  grantPremium: boolean;
  // Only the env-sourced App Store password re-syncs an existing account's
  // hash — the Play Store one keeps its original create-once behavior.
  syncPasswordIfExists: boolean;
}

async function seedReviewerAccount(account: ReviewerAccount): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: account.email } });
  if (existing) {
    if (
      account.syncPasswordIfExists &&
      !(existing.passwordHash && (await bcrypt.compare(account.password, existing.passwordHash)))
    ) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await bcrypt.hash(account.password, BCRYPT_SALT_ROUNDS) },
      });
      console.log(`seed-playstore-demo: ${account.email} already exists, password re-synced.`);
      return;
    }
    console.log(`seed-playstore-demo: ${account.email} already exists, nothing to do.`);
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: account.companyName,
      siret: '90000000000018',
      addressLine1: '1 rue de la Démonstration',
      postalCode: '75001',
      city: 'Paris',
      legalStatus: LegalStatus.MICRO_ENTREPRENEUR,
      vatRateBasisPoints: 2000,
      ...(account.grantPremium
        ? { premiumGrantedUntil: PREMIUM_GRANTED_UNTIL, grantedPlanTier: PlanTier.PREMIUM }
        : {}),
      referralCode: generateReferralCode(),
    },
  });

  await prisma.user.create({
    data: {
      email: account.email,
      passwordHash: await bcrypt.hash(account.password, BCRYPT_SALT_ROUNDS),
      role: UserRole.ARTISAN,
      companyId: company.id,
      newsletterOptIn: false,
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      emailVerifiedAt: new Date(),
    },
  });

  const customer = await prisma.customer.create({
    data: {
      companyId: company.id,
      name: 'Client de démonstration',
      address: '2 avenue des Exemples, 75002 Paris',
      email: 'client.demo@example.fr',
      phone: '06 00 00 00 00',
    },
  });

  const PRODUCT_PRICE_CENTS = 5000;
  const product = await prisma.product.create({
    data: {
      companyId: company.id,
      code: 'DEMO-PROD',
      name: 'Fourniture de démonstration',
      unit: Unit.UNIT,
      priceCents: PRODUCT_PRICE_CENTS,
      activityCategory: ActivityCategory.VENTE_MARCHANDISES,
    },
  });

  const SERVICE_PRICE_CENTS = 15000;
  const service = await prisma.service.create({
    data: {
      companyId: company.id,
      code: 'DEMO-SERVICE',
      name: 'Prestation de démonstration',
      pricingMode: ServicePricingMode.FIXED,
      priceCents: SERVICE_PRICE_CENTS,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  });

  await prisma.invoice.create({
    data: {
      number: 'F-000001',
      documentType: DocumentType.FACTURE,
      date: new Date('2026-06-01'),
      companyId: company.id,
      customerId: customer.id,
      customerName: customer.name,
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.PAYEE,
      paidAt: new Date('2026-06-10'),
      lines: {
        create: [
          {
            position: 0,
            description: product.name,
            unit: product.unit,
            quantity: '2',
            unitPriceCents: PRODUCT_PRICE_CENTS,
            productCode: product.code,
            activityCategory: ActivityCategory.VENTE_MARCHANDISES,
          },
        ],
      },
      serviceLines: {
        create: [
          {
            position: 0,
            serviceId: service.id,
            name: service.name,
            amountCents: SERVICE_PRICE_CENTS,
            visibility: ServiceVisibility.VISIBLE,
            activityCategory: ActivityCategory.PRESTATION_BIC,
          },
        ],
      },
    },
  });

  await prisma.invoice.create({
    data: {
      number: 'DEV-000001',
      documentType: DocumentType.DEVIS,
      date: new Date('2026-07-15'),
      companyId: company.id,
      customerId: customer.id,
      customerName: customer.name,
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.NON_PAYEE,
      serviceLines: {
        create: [
          {
            position: 0,
            serviceId: service.id,
            name: service.name,
            amountCents: SERVICE_PRICE_CENTS,
            visibility: ServiceVisibility.VISIBLE,
            activityCategory: ActivityCategory.PRESTATION_BIC,
          },
        ],
      },
    },
  });

  console.log(`seed-playstore-demo: reviewer account seeded: ${account.email}`);
}

async function main(): Promise<void> {
  await seedReviewerAccount({
    email: PLAYSTORE_DEMO_EMAIL,
    password: PLAYSTORE_DEMO_PASSWORD,
    companyName: 'Compte de démonstration',
    grantPremium: true,
    syncPasswordIfExists: false,
  });

  const appStoreSandboxPassword = process.env.APPSTORE_SANDBOX_PASSWORD;
  if (!appStoreSandboxPassword) {
    console.warn(
      `seed-playstore-demo: APPSTORE_SANDBOX_PASSWORD not set, skipping ${APPSTORE_SANDBOX_EMAIL}.`,
    );
    return;
  }
  await seedReviewerAccount({
    email: APPSTORE_SANDBOX_EMAIL,
    password: appStoreSandboxPassword,
    companyName: 'Compte de démonstration (App Store)',
    grantPremium: false,
    syncPasswordIfExists: true,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

// `make demo` / `make demo-down` (see Makefile, infra/demo-seed.sh) — populates a
// throwaway database with two fictitious tenants (an artisan du bâtiment and a
// beauty institute) so the app can be demoed to prospects/investors without
// exposing any real artisan's data. Runs as plain `node dist/prisma/seed-demo.js`
// inside the already-running dev backend container (compiled by the same tsc
// watch that compiles src/ — see entrypoint.dev.sh), not through the HTTP API:
// rows are inserted straight via Prisma Client, mirroring exactly what
// UserRepository.createWithCompany/AuthService would produce for a real signup.
//
// Idempotent: reruns wipe any previously-seeded demo companies (matched by the
// fixed emails below) before recreating them, so `make demo` can be re-run
// against an already-seeded database (e.g. a container restart) without
// unique-constraint errors.
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
// Plain data, zero Nest imports (see that file's own header) — safe to pull
// into this standalone script, unlike anything else under src/. This is what
// makes AuthController's one-click demo-login endpoints (`/auth/demo-login`)
// and this seed agree on exactly which email logs into which tenant.
import { DEMO_PROFILES } from '../src/auth/demo.constants';
import { generateReferralCode } from '../src/referral/referral-code-generator.util';
import { PrismaClient } from '../generated/prisma/client';
import {
  ActivityCategory,
  DeclarationFrequency,
  DiscountType,
  DocumentType,
  InvoiceStatus,
  LegalStatus,
  PlanTier,
  ServicePricingMode,
  ServiceVisibility,
  SignatureMethod,
  Unit,
  UserRole,
  WasteSurcharge,
} from '../generated/prisma/enums';

// Mirror backend/src/auth/auth.constants.ts — a standalone script rather than
// importing that module directly, to keep this file free of any dependency on
// the Nest application tree.
const BCRYPT_SALT_ROUNDS = 12;
const CURRENT_TERMS_VERSION = '1.0';

function demoEmail(key: string): string {
  const profile = DEMO_PROFILES.find((p) => p.key === key);
  if (!profile) {
    throw new Error(`seed-demo: no DEMO_PROFILES entry for key ${key}`);
  }
  return profile.email;
}

const DEMO_ARTISAN_EMAIL = demoEmail('artisan');
const DEMO_ARTISAN_PASSWORD = 'DemoArtisan2026!';
const DEMO_BEAUTE_EMAIL = demoEmail('beaute');
const DEMO_BEAUTE_PASSWORD = 'DemoBeaute2026!';

// No real Stripe subscription behind these tenants — premiumGrantedUntil +
// grantedPlanTier is the same "plan access granted outside Stripe"
// mechanism as an admin grant or a redeemed PromoCode (see
// PlanGateService.getEffectivePlanTier), so a prospect/investor clicking
// through the demo never hits the paywall and sees every Premium-only
// feature (Phase 30: AI assistant, analytics) unlocked.
const DEMO_PREMIUM_GRANTED_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: mustGetEnv('DATABASE_URL') }),
});

// Phase 1.1-5: the one binary asset this seed needs — a small drawn-looking
// signature PNG reused across whichever invoice(s) get the photo-method
// InvoiceSignature below. Read once at module load (same fail-fast spirit as
// mustGetEnv); path is process.cwd()-relative rather than __dirname-relative
// since this script always runs compiled as dist/prisma/seed-demo.js while
// seed-assets/ (a binary, never compiled by tsc) only ever exists alongside
// the *source* prisma/ folder — both the dev container (whole backend/
// bind-mounted at /app) and the prod image (Dockerfile's explicit
// `COPY --from=build /app/prisma ./prisma`) put that source prisma/ folder
// at the container's WORKDIR, which is also where `node dist/prisma/...`
// is always invoked from.
const DEMO_SIGNATURE_IMAGE: { image: Buffer; mimeType: string } = {
  image: fs.readFileSync(path.join(process.cwd(), 'prisma', 'seed-assets', 'demo-signature.png')),
  mimeType: 'image/png',
};

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`seed-demo: missing required env var ${name}`);
  }
  return value;
}

interface SeedCustomer {
  key: string;
  name: string;
  companyName?: string;
  address?: string;
  email?: string;
  phone?: string;
  siret?: string;
  description?: string;
}

interface SeedLine {
  description: string;
  unit: Unit;
  quantity: string;
  unitPriceCents: number;
  wasteSurcharge?: WasteSurcharge;
  packagingQuantity?: string;
  roundUpToPackaging?: boolean;
  productCode?: string;
  activityCategory?: ActivityCategory;
}

interface SeedServiceLine {
  serviceKey?: string;
  name: string;
  description?: string;
  amountCents: number;
  visibility?: ServiceVisibility;
  activityCategory?: ActivityCategory;
  // Equal split (weight 1 on every line) — shorthand for the common case.
  redistribute?: boolean;
  // Uneven split — one weight per invoice line, in position order (e.g. [3, 1, 0]
  // to load a surcharge mostly onto the first line, a little onto the second,
  // none onto the third). Takes precedence over `redistribute` when set.
  redistributeWeights?: number[];
}

interface SeedDiscountLine {
  discountKey?: string;
  name: string;
  amountCents: number;
}

interface SeedDocument {
  number: string;
  documentType?: DocumentType;
  date: string;
  customerKey: string;
  vatApplicable: boolean;
  vatRateBasisPoints: number;
  lines?: SeedLine[];
  serviceLines?: SeedServiceLine[];
  discountLines?: SeedDiscountLine[];
  status?: InvoiceStatus;
  dueDate?: string;
  paidAt?: string;
  convertedFromDevisNumber?: string;
  // Phase 1.1-3: FACTURE-only, both null on every document above unless set.
  depositPercentageBasisPoints?: number;
  depositAmountCents?: number;
  depositPaidAt?: string;
  // Phase 1.1-1: the freehand fallback, no attached InvoiceSignature.
  manuallySigned?: boolean;
  // Phase 1.1-1: attaches DEMO_SIGNATURE_IMAGE as a PHOTO-method
  // InvoiceSignature — mutually exclusive with manuallySigned in practice
  // (a real signature locks the checkbox, same as the app itself).
  attachSignaturePhoto?: boolean;
}

interface ProductDef {
  key: string;
  name: string;
  unit: Unit;
  priceCents: number;
  packagingQuantity?: string;
  supplierName?: string;
  // Defaults to VENTE_MARCHANDISES — overridden for rental "products" below
  // (a compressor/nacelle/chair rented by the hour/day is a prestation for
  // URSSAF purposes, even though it's modeled as a Product so it can carry a
  // unit + quantity like any other quantity-billed line).
  activityCategory?: ActivityCategory;
  // Phase 1.1-2: zero, one, or several dossiers this item belongs to.
  folderKeys?: string[];
}

interface ServiceDef {
  key: string;
  name: string;
  priceCents: number;
  description?: string;
  // Phase 1.1-2: zero, one, or several dossiers this item belongs to.
  folderKeys?: string[];
}

// Phase 1.1-2: a single, type-agnostic "dossier" an item can optionally
// belong to — key is this seed's own lookup handle, name is what's stored.
interface FolderDef {
  key: string;
  name: string;
}

// Phase 32/1.1-2: a reusable named remise, same shorter shape as the DTO
// (exactly one of fixedAmountCents/percentageBasisPoints, enforced by
// DiscountConsistency on the real create endpoint — this seed just mirrors
// that by construction).
interface DiscountDef {
  key: string;
  name: string;
  discountType: DiscountType;
  fixedAmountCents?: number;
  percentageBasisPoints?: number;
  folderKeys?: string[];
}

async function wipeExistingDemoData(): Promise<void> {
  const existing = await prisma.user.findMany({
    where: { email: { in: [DEMO_ARTISAN_EMAIL, DEMO_BEAUTE_EMAIL] } },
    select: { companyId: true },
  });
  if (existing.length > 0) {
    // Company.onDelete: Cascade fans out to every invoice/customer/product/
    // service row for that tenant (Phase 1.1-5: CatalogFolder/Discount are
    // companyId-cascaded the same way, InvoiceSignature cascades off the
    // Invoice it belongs to — no extra deletes needed here), and
    // User.onDelete: Cascade (keyed off Company) removes the login itself —
    // one delete is enough.
    await prisma.company.deleteMany({ where: { id: { in: existing.map((u) => u.companyId) } } });
  }
}

async function createTenant(params: {
  company: Omit<Parameters<typeof prisma.company.create>[0]['data'], 'referralCode'>;
  email: string;
  password: string;
  newsletterOptIn: boolean;
}) {
  const company = await prisma.company.create({
    data: { ...params.company, referralCode: generateReferralCode() },
  });
  await prisma.user.create({
    data: {
      email: params.email,
      passwordHash: await bcrypt.hash(params.password, BCRYPT_SALT_ROUNDS),
      role: UserRole.ARTISAN,
      companyId: company.id,
      newsletterOptIn: params.newsletterOptIn,
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      emailVerifiedAt: new Date(),
    },
  });
  return company;
}

async function createCustomers(companyId: string, customers: SeedCustomer[]) {
  const byKey = new Map<string, { id: string; name: string; companyName: string | null }>();
  for (const c of customers) {
    const row = await prisma.customer.create({
      data: {
        companyId,
        name: c.name,
        companyName: c.companyName ?? null,
        address: c.address ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        siret: c.siret ?? null,
        description: c.description ?? null,
      },
    });
    byKey.set(c.key, { id: row.id, name: row.name, companyName: row.companyName });
  }
  return byKey;
}

async function createFolders(
  companyId: string,
  folders: FolderDef[],
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  for (const f of folders) {
    const row = await prisma.catalogFolder.create({ data: { companyId, name: f.name } });
    byKey.set(f.key, row.id);
  }
  return byKey;
}

async function createDiscounts(
  companyId: string,
  folders: Map<string, string>,
  discountDefs: DiscountDef[],
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  for (const d of discountDefs) {
    const row = await prisma.discount.create({
      data: {
        companyId,
        name: d.name,
        discountType: d.discountType,
        fixedAmountCents: d.fixedAmountCents,
        percentageBasisPoints: d.percentageBasisPoints,
        folders: d.folderKeys
          ? { connect: d.folderKeys.map((key) => ({ id: folders.get(key)! })) }
          : undefined,
      },
    });
    byKey.set(d.key, row.id);
  }
  return byKey;
}

async function createDocuments(
  companyId: string,
  customers: Map<string, { id: string; name: string; companyName: string | null }>,
  services: Map<string, string>,
  discounts: Map<string, string>,
  documents: SeedDocument[],
) {
  const invoiceIdsByNumber = new Map<string, string>();

  for (const doc of documents) {
    const customer = customers.get(doc.customerKey);
    if (!customer) {
      throw new Error(`seed-demo: unknown customerKey ${doc.customerKey}`);
    }
    const convertedFromDevisId = doc.convertedFromDevisNumber
      ? invoiceIdsByNumber.get(doc.convertedFromDevisNumber)
      : undefined;

    const invoice = await prisma.invoice.create({
      data: {
        number: doc.number,
        documentType: doc.documentType ?? DocumentType.FACTURE,
        date: new Date(doc.date),
        companyId,
        customerId: customer.id,
        customerName: customer.companyName ?? customer.name,
        vatApplicable: doc.vatApplicable,
        vatRateBasisPoints: doc.vatRateBasisPoints,
        status: doc.status ?? InvoiceStatus.NON_PAYEE,
        dueDate: doc.dueDate ? new Date(doc.dueDate) : null,
        paidAt: doc.paidAt ? new Date(doc.paidAt) : null,
        convertedFromDevisId: convertedFromDevisId ?? null,
        depositPercentageBasisPoints: doc.depositPercentageBasisPoints ?? null,
        depositAmountCents: doc.depositAmountCents ?? null,
        depositPaidAt: doc.depositPaidAt ? new Date(doc.depositPaidAt) : null,
        manuallySigned: doc.manuallySigned ?? false,
        lines: doc.lines
          ? {
              create: doc.lines.map((line, position) => ({
                position,
                description: line.description,
                unit: line.unit,
                quantity: line.quantity,
                unitPriceCents: line.unitPriceCents,
                wasteSurcharge: line.wasteSurcharge ?? WasteSurcharge.NONE,
                packagingQuantity: line.packagingQuantity,
                roundUpToPackaging: line.roundUpToPackaging ?? true,
                productCode: line.productCode,
                activityCategory: line.activityCategory,
              })),
            }
          : undefined,
      },
      include: { lines: true },
    });

    invoiceIdsByNumber.set(doc.number, invoice.id);

    if (doc.serviceLines) {
      for (const [position, sl] of doc.serviceLines.entries()) {
        const visibility = sl.visibility ?? ServiceVisibility.VISIBLE;
        await prisma.invoiceServiceLine.create({
          data: {
            invoiceId: invoice.id,
            position,
            serviceId: sl.serviceKey ? (services.get(sl.serviceKey) ?? null) : null,
            name: sl.name,
            description: sl.description,
            amountCents: sl.amountCents,
            visibility,
            activityCategory: sl.activityCategory,
            weights:
              visibility === ServiceVisibility.REDISTRIBUTED && sl.redistributeWeights
                ? {
                    create: invoice.lines.map((l, i) => ({
                      invoiceLineId: l.id,
                      weight: sl.redistributeWeights![i],
                    })),
                  }
                : sl.redistribute && visibility === ServiceVisibility.REDISTRIBUTED
                  ? { create: invoice.lines.map((l) => ({ invoiceLineId: l.id, weight: 1 })) }
                  : undefined,
          },
        });
      }
    }

    if (doc.discountLines) {
      for (const [position, dl] of doc.discountLines.entries()) {
        await prisma.invoiceDiscountLine.create({
          data: {
            invoiceId: invoice.id,
            position,
            discountId: dl.discountKey ? (discounts.get(dl.discountKey) ?? null) : null,
            name: dl.name,
            amountCents: dl.amountCents,
          },
        });
      }
    }

    if (doc.attachSignaturePhoto) {
      // Same Buffer-is-a-Uint8Array-at-runtime cast as
      // InvoiceRepository.upsertSignature — works around Prisma 7's
      // generated Bytes type being pinned to Uint8Array<ArrayBuffer>.
      await prisma.invoiceSignature.create({
        data: {
          invoiceId: invoice.id,
          image: DEMO_SIGNATURE_IMAGE.image as unknown as Uint8Array<ArrayBuffer>,
          mimeType: DEMO_SIGNATURE_IMAGE.mimeType,
          method: SignatureMethod.PHOTO,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Vertical 1: artisan du bâtiment (multi-corps d'état rénovation)
// ---------------------------------------------------------------------------

async function seedArtisanBatiment(): Promise<void> {
  const company = await createTenant({
    company: {
      name: 'Bâti Rénov',
      siret: '89234567800017',
      addressLine1: '14 rue des Artisans',
      postalCode: '69003',
      city: 'Lyon',
      email: 'contact@batirenov-demo.fr',
      phone: '04 78 12 34 56',
      legalStatus: LegalStatus.COMPANY,
      vatRateBasisPoints: 2000,
      premiumGrantedUntil: DEMO_PREMIUM_GRANTED_UNTIL,
      grantedPlanTier: PlanTier.PREMIUM,
      // Phase 1.1-3: habitual acompte rate — pre-fills the toggle on every
      // new FACTURE from now on (see F-000007 below for the opted-in state
      // this produces, unchanged from what an artisan setting this in "Mon
      // entreprise" would see).
      defaultDepositPercentageBasisPoints: 3000,
      // Phase 1.1-6: free-text footer mention, shown on both factures and
      // devis — L'Atelier Beauté below is left with both toggles at their
      // default false, so the demo shows both the opted-in and untouched
      // states.
      customFooterMessage:
        'Devis gratuit et sans engagement. Intervention sous 48h en cas d’urgence.',
      customFooterOnFacture: true,
      customFooterOnDevis: true,
    },
    email: DEMO_ARTISAN_EMAIL,
    password: DEMO_ARTISAN_PASSWORD,
    newsletterOptIn: true,
  });

  const customers = await createCustomers(company.id, [
    {
      key: 'lefevre',
      name: 'M. et Mme Lefèvre',
      address: '12 allée des Cerisiers, 69300 Caluire-et-Cuire',
      email: 'lefevre.famille@example.fr',
      phone: '06 12 34 56 78',
    },
    {
      key: 'sci-tilleuls',
      name: 'Antoine Roussel',
      companyName: 'SCI Les Tilleuls',
      address: '5 place Bellecour, 69002 Lyon',
      email: 'a.roussel@example.fr',
      phone: '06 45 12 78 90',
      siret: '78912345600014',
    },
    {
      key: 'haddad',
      name: 'Karim Haddad',
      address: '23 rue Garibaldi, 69003 Lyon',
      email: 'karim.haddad@example.fr',
      phone: '07 89 45 12 36',
    },
    {
      key: 'copro-closfleuri',
      name: 'Copropriété Le Clos Fleuri',
      address: '8 rue des Frères Lumière, 69008 Lyon',
      email: 'syndic.closfleuri@example.fr',
      phone: '04 78 90 12 34',
      description: 'Syndic: Cabinet Foncia Lyon Est',
    },
    {
      key: 'mairie-villefranche',
      name: 'Mairie de Villefranche-sur-Saône',
      address: 'Place Faubert, 69400 Villefranche-sur-Saône',
      email: 'services.techniques@example.fr',
      phone: '04 74 00 00 00',
    },
    {
      key: 'bernard',
      name: 'Sophie Bernard',
      address: '41 avenue Berthelot, 69007 Lyon',
      email: 'sophie.bernard@example.fr',
      phone: '06 78 90 12 45',
    },
    {
      key: 'dubreuil',
      name: 'Marc Dubreuil',
      address: '9 rue Victor Hugo, 69100 Villeurbanne',
      email: 'marc.dubreuil@example.fr',
      phone: '06 23 45 67 89',
      description: 'Prospect — demande de devis salle de bain en cours de réflexion',
    },
    {
      key: 'residence-ormes',
      name: 'Résidence Les Ormes',
      address: '17 chemin des Ormes, 69330 Meyzieu',
      email: 'gestion@example.fr',
      phone: '04 72 00 00 00',
    },
  ]);

  // Phase 1.1-2: dossiers matching Bâti Rénov's real corps de métier —
  // created before the catalog below so products/services can connect into
  // them at creation time.
  const folders = await createFolders(company.id, [
    { key: 'sol', name: 'Sol' },
    { key: 'peinture', name: 'Peinture' },
    { key: 'platrerie', name: 'Plâtrerie' },
  ]);

  const productDefs: ProductDef[] = [
    {
      key: 'CAR-GC60',
      name: 'Carrelage grès cérame 60x60 gris anthracite',
      unit: Unit.SQUARE_METER,
      priceCents: 3490,
      packagingQuantity: '1.44',
      supplierName: 'Point P',
      folderKeys: ['sol'],
    },
    {
      key: 'PARQ-CH14',
      name: 'Parquet contrecollé chêne 14mm',
      unit: Unit.SQUARE_METER,
      priceCents: 5290,
      packagingQuantity: '2.22',
      supplierName: 'Leroy Merlin Pro',
      folderKeys: ['sol'],
    },
    {
      key: 'PEINT-BLC10',
      name: 'Peinture acrylique mate blanc (seau 10L)',
      unit: Unit.LITER,
      priceCents: 690,
      packagingQuantity: '10',
      supplierName: 'Tollens',
      folderKeys: ['peinture'],
    },
    {
      key: 'PLACO-BA13',
      name: 'Plaque de plâtre BA13 (2.5x1.2m)',
      unit: Unit.UNIT,
      priceCents: 990,
      supplierName: 'Leroy Merlin Pro',
      folderKeys: ['platrerie'],
    },
    {
      key: 'CIM-25KG',
      name: 'Sac de ciment 25kg',
      unit: Unit.KILOGRAM,
      priceCents: 24,
      packagingQuantity: '25',
      supplierName: 'Point P',
      // Used for both a sol's chape and plâtrerie scellement — the one item
      // in this tenant's catalog that actually exercises the many-to-many
      // folder picker (belongs to two dossiers at once).
      folderKeys: ['sol', 'platrerie'],
    },
    {
      key: 'PER-16',
      name: 'Tube PER Ø16mm (barre 5m)',
      unit: Unit.LINEAR_METER,
      priceCents: 180,
      packagingQuantity: '5',
      supplierName: 'Cedeo',
    },
    {
      key: 'ISOL-LV100',
      name: 'Isolant laine de verre 100mm (rouleau 8.5m²)',
      unit: Unit.SQUARE_METER,
      priceCents: 890,
      packagingQuantity: '8.5',
      supplierName: 'Point P',
      folderKeys: ['platrerie'],
    },
    // Below: less conventional catalog entries — rounding out the Unit
    // enum (CUBIC_METER, HOUR, DAY, LUMP_SUM haven't been used yet above)
    // and two edge cases (fractional/near-1 packaging, a high-waste
    // material) exercised by F-000006 below.
    {
      key: 'TOMETTE-HEX',
      name: 'Tomettes hexagonales terre cuite 20x20',
      unit: Unit.SQUARE_METER,
      priceCents: 6890,
      packagingQuantity: '0.72',
      supplierName: 'Point P',
      folderKeys: ['sol'],
    },
    {
      key: 'BETON-C2530',
      name: 'Béton prêt à l’emploi C25/30 (toupie)',
      unit: Unit.CUBIC_METER,
      priceCents: 12500,
      supplierName: 'Lafarge Bétons',
    },
    {
      key: 'GRAVIER-020',
      name: 'Gravier 0/20 (livraison vrac)',
      unit: Unit.CUBIC_METER,
      priceCents: 4200,
      supplierName: 'Point P',
    },
    {
      key: 'KIT-CONSOMMABLES',
      name: 'Forfait petit outillage & consommables chantier',
      unit: Unit.LUMP_SUM,
      priceCents: 4500,
    },
    // Own equipment rented out to the client for the duration of the job —
    // billed by the hour/day like a material line (Product/InvoiceLine is
    // the only model with a `unit`+`quantity`), but categorized as a
    // prestation, not a sale of goods.
    {
      key: 'LOC-COMPRESSEUR',
      name: 'Location compresseur pneumatique',
      unit: Unit.HOUR,
      priceCents: 800,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
    {
      key: 'LOC-NACELLE',
      name: 'Location nacelle élévatrice',
      unit: Unit.DAY,
      priceCents: 18000,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  ];

  for (const p of productDefs) {
    await prisma.product.create({
      data: {
        companyId: company.id,
        code: p.key,
        name: p.name,
        unit: p.unit,
        priceCents: p.priceCents,
        packagingQuantity: p.packagingQuantity,
        supplierName: p.supplierName,
        activityCategory: p.activityCategory ?? ActivityCategory.VENTE_MARCHANDISES,
        folders: p.folderKeys
          ? { connect: p.folderKeys.map((key) => ({ id: folders.get(key)! })) }
          : undefined,
      },
    });
  }

  const serviceDefs: ServiceDef[] = [
    {
      key: 'pose-sol',
      name: 'Main d’œuvre pose de sol',
      description: 'Forfait journée — pose carrelage, parquet ou sol souple, jointoiement inclus',
      priceCents: 35000,
      folderKeys: ['sol'],
    },
    {
      key: 'pose-peinture',
      name: 'Main d’œuvre peinture',
      description: 'Forfait journée, 2 couches, protection du mobilier incluse',
      priceCents: 32000,
      folderKeys: ['peinture'],
    },
    {
      key: 'depose',
      name: 'Dépose ancien revêtement',
      description: 'Dépose et évacuation de l’ancien carrelage/sol',
      priceCents: 18000,
      folderKeys: ['sol'],
    },
    {
      key: 'deplacement',
      name: 'Déplacement & mise en œuvre chantier',
      priceCents: 6000,
    },
    {
      key: 'nettoyage-chantier',
      name: 'Nettoyage fin de chantier',
      description: 'Évacuation des gravats, nettoyage complet des lieux avant restitution',
      priceCents: 15000,
    },
    {
      key: 'etude-technique',
      name: 'Étude technique & relevés',
      description: 'Visite chiffrée, métrés et relevés avant établissement du devis',
      priceCents: 9000,
    },
  ];

  const services = new Map<string, string>();
  for (const s of serviceDefs) {
    const row = await prisma.service.create({
      data: {
        companyId: company.id,
        code: s.key,
        name: s.name,
        description: s.description,
        pricingMode: ServicePricingMode.FIXED,
        priceCents: s.priceCents,
        activityCategory: ActivityCategory.PRESTATION_BIC,
        folders: s.folderKeys
          ? { connect: s.folderKeys.map((key) => ({ id: folders.get(key)! })) }
          : undefined,
      },
    });
    services.set(s.key, row.id);
  }

  const margeRow = await prisma.service.create({
    data: {
      companyId: company.id,
      code: 'marge-fournisseur',
      name: 'Marge fournisseur',
      description: 'Marge appliquée sur les matériaux, répartie sur les lignes de la facture',
      pricingMode: ServicePricingMode.PERCENTAGE,
      percentageBasisPoints: 1500,
      defaultVisibility: ServiceVisibility.REDISTRIBUTED,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  });
  services.set('marge-fournisseur', margeRow.id);

  const urgenceRow = await prisma.service.create({
    data: {
      companyId: company.id,
      code: 'majoration-urgence',
      name: 'Majoration urgence / intervention rapide',
      description:
        'Surcoût pour une intervention en dehors des délais habituels, réparti sur le chantier',
      pricingMode: ServicePricingMode.PERCENTAGE,
      percentageBasisPoints: 2000,
      defaultVisibility: ServiceVisibility.REDISTRIBUTED,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  });
  services.set('majoration-urgence', urgenceRow.id);

  // Prestataires/sous-traitants — WORKAROUND, not a real feature. This app
  // only models money the company is OWED (client invoices), never money it
  // owes out, and there is no way to fix that with a catalog entry: this
  // pass-through Service only reads as "what I owe" because it's priced at
  // exact cost with no markup, breaks the moment two client jobs share one
  // subcontractor and need a combined total, and has no payment-status
  // lifecycle independent of the client's own. See docs/roadmap.md Phase 28
  // ("Prestataires & Sous-traitance: What You Owe, Not What You're Owed"),
  // opened after this exact seed surfaced the gap — not yet built. Until it
  // is, this stays the least-bad stand-in: a stable, named catalog entry
  // reused on every job, so "Statistiques > Meilleures prestations" at least
  // approximates a running total for the narrow case where cost == billed
  // amount and payment happens to track the client's own.
  const sousTraitanceDefs: ServiceDef[] = [
    {
      key: 'stt-elec-dupont',
      name: 'Sous-traitance électricité — Dupont Élec (SASU)',
      description: 'Refacturé au client au prix coûtant — électricien indépendant',
      priceCents: 65000,
    },
    {
      key: 'stt-diag-amiante',
      name: 'Diagnostic amiante avant travaux — Bureau Véritas',
      description:
        'Diagnostic réglementaire obligatoire, organisme certifié, refacturé au prix coûtant',
      priceCents: 28000,
    },
  ];
  for (const s of sousTraitanceDefs) {
    const row = await prisma.service.create({
      data: {
        companyId: company.id,
        code: s.key,
        name: s.name,
        description: s.description,
        pricingMode: ServicePricingMode.FIXED,
        priceCents: s.priceCents,
        activityCategory: ActivityCategory.PRESTATION_BIC,
      },
    });
    services.set(s.key, row.id);
  }

  const discounts = await createDiscounts(company.id, folders, [
    {
      key: 'fidelite',
      name: 'Remise fidélité chantier suivi',
      discountType: DiscountType.FIXED,
      fixedAmountCents: 5000,
    },
    {
      key: 'gros-chantier',
      name: 'Remise gros chantier',
      discountType: DiscountType.PERCENTAGE,
      percentageBasisPoints: 500,
      folderKeys: ['sol'],
    },
  ]);

  await createDocuments(company.id, customers, services, discounts, [
    {
      number: 'F-000001',
      date: '2026-02-12',
      customerKey: 'lefevre',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-02-20',
      // Phase 1.1-1: the "real photo signature" example — a signed chantier
      // handoff, photographed and attached.
      attachSignaturePhoto: true,
      lines: [
        {
          description: 'Carrelage sol grès cérame 60x60 gris anthracite',
          unit: Unit.SQUARE_METER,
          quantity: '8',
          unitPriceCents: 3490,
          wasteSurcharge: WasteSurcharge.TEN,
          packagingQuantity: '1.44',
          productCode: 'CAR-GC60',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'depose',
          name: 'Dépose ancien revêtement',
          amountCents: 18000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'pose-sol',
          name: 'Main d’œuvre pose de sol',
          amountCents: 35000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'F-000002',
      date: '2026-03-05',
      customerKey: 'sci-tilleuls',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.NON_PAYEE,
      dueDate: '2026-06-15',
      lines: [
        {
          description: 'Peinture acrylique mate blanc',
          unit: Unit.LITER,
          quantity: '40',
          unitPriceCents: 690,
          packagingQuantity: '10',
          productCode: 'PEINT-BLC10',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Plaque de plâtre BA13',
          unit: Unit.UNIT,
          quantity: '12',
          unitPriceCents: 990,
          productCode: 'PLACO-BA13',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'pose-peinture',
          name: 'Main d’œuvre peinture',
          description: 'Forfait 2 journées de travail — parties communes',
          amountCents: 64000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'DEV-000001',
      documentType: DocumentType.DEVIS,
      date: '2026-03-20',
      customerKey: 'haddad',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      lines: [
        {
          description: 'Tube PER Ø16mm',
          unit: Unit.LINEAR_METER,
          quantity: '25',
          unitPriceCents: 180,
          packagingQuantity: '5',
          productCode: 'PER-16',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          name: 'Remplacement réseau eau chaude/froide',
          description: 'Dépose ancien réseau, pose nouveau réseau PER, raccordements',
          amountCents: 42000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'F-000003',
      date: '2026-04-02',
      customerKey: 'haddad',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-04-10',
      convertedFromDevisNumber: 'DEV-000001',
      // Phase 1.1-1: the freehand fallback — checked by hand, no photo/drawn
      // proof attached.
      manuallySigned: true,
      lines: [
        {
          description: 'Tube PER Ø16mm',
          unit: Unit.LINEAR_METER,
          quantity: '25',
          unitPriceCents: 180,
          packagingQuantity: '5',
          productCode: 'PER-16',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          name: 'Remplacement réseau eau chaude/froide',
          description: 'Dépose ancien réseau, pose nouveau réseau PER, raccordements',
          amountCents: 42000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'F-000004',
      date: '2026-05-20',
      customerKey: 'copro-closfleuri',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.ANNULEE,
      lines: [
        {
          description: 'Isolant laine de verre 100mm',
          unit: Unit.SQUARE_METER,
          quantity: '120',
          unitPriceCents: 890,
          packagingQuantity: '8.5',
          productCode: 'ISOL-LV100',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'deplacement',
          name: 'Déplacement & mise en œuvre chantier',
          amountCents: 6000,
        },
      ],
    },
    {
      number: 'F-000005',
      date: '2026-07-08',
      customerKey: 'bernard',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.NON_PAYEE,
      dueDate: '2026-08-10',
      lines: [
        {
          description: 'Parquet contrecollé chêne 14mm',
          unit: Unit.SQUARE_METER,
          quantity: '30',
          unitPriceCents: 5290,
          packagingQuantity: '2.22',
          productCode: 'PARQ-CH14',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Sac de ciment 25kg (ragréage)',
          unit: Unit.KILOGRAM,
          quantity: '50',
          unitPriceCents: 24,
          packagingQuantity: '25',
          productCode: 'CIM-25KG',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'pose-sol',
          name: 'Main d’œuvre pose de sol',
          amountCents: 35000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'marge-fournisseur',
          name: 'Marge fournisseur',
          amountCents: 24800,
          visibility: ServiceVisibility.REDISTRIBUTED,
          redistribute: true,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'DEV-000002',
      documentType: DocumentType.DEVIS,
      date: '2026-07-20',
      customerKey: 'mairie-villefranche',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      lines: [
        {
          description: 'Carrelage sol grès cérame 60x60 gris anthracite — salle des fêtes',
          unit: Unit.SQUARE_METER,
          quantity: '200',
          unitPriceCents: 3490,
          wasteSurcharge: WasteSurcharge.TEN,
          packagingQuantity: '1.44',
          productCode: 'CAR-GC60',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Peinture acrylique mate blanc',
          unit: Unit.LITER,
          quantity: '120',
          unitPriceCents: 690,
          packagingQuantity: '10',
          productCode: 'PEINT-BLC10',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'pose-sol',
          name: 'Main d’œuvre pose de sol',
          description: 'Forfait 5 journées, grande surface',
          amountCents: 175000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'pose-peinture',
          name: 'Main d’œuvre peinture',
          description: 'Forfait 3 journées',
          amountCents: 96000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'deplacement',
          name: 'Déplacement & mise en œuvre chantier',
          amountCents: 6000,
        },
        {
          serviceKey: 'stt-diag-amiante',
          name: 'Diagnostic amiante avant travaux — Bureau Véritas',
          description: 'Obligatoire, bâtiment recevant du public antérieur à 1997',
          amountCents: 28000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'stt-elec-dupont',
          name: 'Sous-traitance électricité — Dupont Élec (SASU)',
          description: 'Mise aux normes tableau électrique, refacturé au prix coûtant',
          amountCents: 65000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      // Cour intérieure — a small, less conventional job: a high-waste
      // decorative pattern billed at the exact quantity needed (leftover
      // stock from a past chantier, so no packaging round-up), concrete by
      // the m³, an hourly-rented compressor, and an "urgence" surcharge
      // unevenly redistributed (weight 0 on the compressor line — the
      // surcharge is for the wait on materials, not for equipment already
      // on-site).
      number: 'F-000006',
      date: '2026-07-25',
      customerKey: 'residence-ormes',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.NON_PAYEE,
      dueDate: '2026-09-01',
      lines: [
        {
          description: 'Tomettes hexagonales terre cuite 20x20 — motif cour intérieure',
          unit: Unit.SQUARE_METER,
          quantity: '18',
          unitPriceCents: 6890,
          wasteSurcharge: WasteSurcharge.TWENTY,
          packagingQuantity: '0.72',
          roundUpToPackaging: false,
          productCode: 'TOMETTE-HEX',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Béton prêt à l’emploi C25/30 (toupie) — dalle de cour',
          unit: Unit.CUBIC_METER,
          quantity: '2.5',
          unitPriceCents: 12500,
          productCode: 'BETON-C2530',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Location compresseur pneumatique',
          unit: Unit.HOUR,
          quantity: '6',
          unitPriceCents: 800,
          productCode: 'LOC-COMPRESSEUR',
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'nettoyage-chantier',
          name: 'Nettoyage fin de chantier',
          amountCents: 15000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'majoration-urgence',
          name: 'Majoration urgence / intervention rapide',
          amountCents: 36975,
          visibility: ServiceVisibility.REDISTRIBUTED,
          redistributeWeights: [3, 1, 0],
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      // A pending quote mixing a day-rate rental, a lump-sum "misc supplies"
      // line, and a one-off freehand line for a part that was never worth
      // adding to the catalog — no productCode at all on that last line.
      number: 'DEV-000003',
      documentType: DocumentType.DEVIS,
      date: '2026-07-24',
      customerKey: 'dubreuil',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      lines: [
        {
          description: 'Location nacelle élévatrice — ravalement partiel',
          unit: Unit.DAY,
          quantity: '2',
          unitPriceCents: 18000,
          productCode: 'LOC-NACELLE',
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          description: 'Forfait petit outillage & consommables chantier',
          unit: Unit.LUMP_SUM,
          quantity: '1',
          unitPriceCents: 4500,
          productCode: 'KIT-CONSOMMABLES',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Réparation ponctuelle gouttière (pièce détachée non référencée)',
          unit: Unit.UNIT,
          quantity: '1',
          unitPriceCents: 4500,
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'etude-technique',
          name: 'Étude technique & relevés',
          amountCents: 9000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      // Phase 1.1-2/32: a remise on a real invoice (the "Sol" folder's
      // gros-chantier percentage discount), and Phase 1.1-3's deposit path
      // pre-filled from the company default (30%, set above) — still
      // NON_PAYEE, the deposit only requested so far, not yet received.
      number: 'F-000007',
      date: '2026-08-02',
      customerKey: 'copro-closfleuri',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.NON_PAYEE,
      dueDate: '2026-09-15',
      lines: [
        {
          description: 'Carrelage sol grès cérame 60x60 gris anthracite — parties communes',
          unit: Unit.SQUARE_METER,
          quantity: '85',
          unitPriceCents: 3490,
          wasteSurcharge: WasteSurcharge.TEN,
          packagingQuantity: '1.44',
          productCode: 'CAR-GC60',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'pose-sol',
          name: 'Main d’œuvre pose de sol',
          description: 'Forfait 4 journées, parties communes',
          amountCents: 140000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
      discountLines: [
        {
          discountKey: 'gros-chantier',
          name: 'Remise gros chantier',
          amountCents: 15000,
        },
      ],
      depositPercentageBasisPoints: 3000,
      depositAmountCents: 130000,
    },
    {
      // Phase 1.1-3's other deposit state: requested and actually received
      // — the board's ACOMPTE_VERSE status, between "Non payée" and "Payée".
      number: 'F-000008',
      date: '2026-08-10',
      customerKey: 'sci-tilleuls',
      vatApplicable: true,
      vatRateBasisPoints: 2000,
      status: InvoiceStatus.ACOMPTE_VERSE,
      dueDate: '2026-09-20',
      lines: [
        {
          description: 'Parquet contrecollé chêne 14mm — rénovation complète',
          unit: Unit.SQUARE_METER,
          quantity: '60',
          unitPriceCents: 5290,
          packagingQuantity: '2.22',
          productCode: 'PARQ-CH14',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'depose',
          name: 'Dépose ancien revêtement',
          amountCents: 18000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'pose-sol',
          name: 'Main d’œuvre pose de sol',
          description: 'Forfait 3 journées',
          amountCents: 105000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
      depositPercentageBasisPoints: 3000,
      depositAmountCents: 150000,
      depositPaidAt: '2026-08-12',
    },
  ]);
}

// ---------------------------------------------------------------------------
// Vertical 2: institut de beauté (coiffure & maquillage)
// ---------------------------------------------------------------------------

async function seedInstitutBeaute(): Promise<void> {
  const company = await createTenant({
    company: {
      name: 'L’Atelier Beauté',
      siret: '85312456700029',
      addressLine1: '27 rue de la Mode',
      postalCode: '75011',
      city: 'Paris',
      email: 'contact@atelierbeaute-demo.fr',
      phone: '06 12 34 56 78',
      legalStatus: LegalStatus.MICRO_ENTREPRENEUR,
      vatRateBasisPoints: 0,
      declarationFrequency: DeclarationFrequency.MENSUELLE,
      premiumGrantedUntil: DEMO_PREMIUM_GRANTED_UNTIL,
      grantedPlanTier: PlanTier.PREMIUM,
    },
    email: DEMO_BEAUTE_EMAIL,
    password: DEMO_BEAUTE_PASSWORD,
    newsletterOptIn: false,
  });

  const customers = await createCustomers(company.id, [
    {
      key: 'petit',
      name: 'Camille Petit',
      address: '6 rue Oberkampf, 75011 Paris',
      email: 'camille.petit@example.fr',
      phone: '06 34 56 78 90',
    },
    {
      key: 'nguyen',
      name: 'Sarah Nguyen',
      address: '18 rue de Charonne, 75011 Paris',
      email: 'sarah.nguyen@example.fr',
      phone: '07 12 45 78 90',
    },
    {
      key: 'ferrand',
      name: 'Nadia Ferrand',
      address: '4 avenue Parmentier, 75011 Paris',
      email: 'nadia.ferrand@example.fr',
      phone: '06 90 12 34 56',
    },
    {
      key: 'moreau',
      name: 'Léa Moreau',
      address: '31 boulevard Voltaire, 75011 Paris',
      email: 'lea.moreau@example.fr',
      phone: '06 45 67 89 01',
      description: 'Mariage prévu le 12/09/2026',
    },
    {
      key: 'agence-prisme',
      name: 'Julien Marchal',
      companyName: 'Agence Événementiel Prisme',
      address: '3 rue de la Paix, 75002 Paris',
      email: 'j.marchal@example.fr',
      phone: '01 42 00 00 00',
      siret: '90123456700021',
    },
    {
      key: 'fontaine',
      name: 'Élise Fontaine',
      address: '11 rue Amelot, 75011 Paris',
      email: 'elise.fontaine@example.fr',
      phone: '06 11 22 33 44',
      description: 'Cliente régulière — coupe tous les 2 mois',
    },
    {
      key: 'roy',
      name: 'Thomas Roy',
      address: '22 rue Saint-Maur, 75011 Paris',
      email: 'thomas.roy@example.fr',
      phone: '06 55 66 77 88',
    },
    {
      key: 'girard',
      name: 'Fanny Girard',
      address: '14 rue de la Fontaine au Roi, 75011 Paris',
      email: 'fanny.girard@example.fr',
      phone: '06 22 33 44 55',
      description: 'Organisatrice — enterrement de vie de jeune fille (groupe de 3)',
    },
    {
      key: 'vidal',
      name: 'Marion Vidal',
      companyName: 'Marion Vidal — Prothésiste ongulaire indépendante',
      address: '27 rue de la Mode, 75011 Paris',
      email: 'marion.vidal@example.fr',
      phone: '06 77 88 99 00',
      siret: '81234567800015',
      description: 'Loue un poste à la journée — prestataire indépendante en sous-location',
    },
  ]);

  // Phase 1.1-2: dossiers matching L'Atelier Beauté's real prestations —
  // created before the catalog below so products/services can connect into
  // them at creation time.
  const folders = await createFolders(company.id, [
    { key: 'visage', name: 'Soins visage' },
    { key: 'corps', name: 'Soins corps' },
    { key: 'groupe', name: 'Prestations groupe' },
  ]);

  const productDefs: ProductDef[] = [
    {
      key: 'SHP-PRO250',
      name: 'Shampoing professionnel sans sulfate 250ml',
      unit: Unit.UNIT,
      priceCents: 1890,
    },
    {
      key: 'SER-CAP50',
      name: 'Sérum réparateur capillaire 50ml',
      unit: Unit.UNIT,
      priceCents: 2490,
    },
    {
      key: 'FDT-30ML',
      name: 'Fond de teint longue tenue 30ml',
      unit: Unit.UNIT,
      priceCents: 3200,
      folderKeys: ['visage'],
    },
    {
      key: 'PAL-MAQ12',
      name: 'Palette maquillage 12 teintes',
      unit: Unit.UNIT,
      priceCents: 4500,
      folderKeys: ['visage'],
    },
    { key: 'VERNIS-SET', name: 'Set vernis à ongles (x3)', unit: Unit.UNIT, priceCents: 1500 },
    // Less conventional catalog entries — retail items sold by volume
    // (packagingQuantity below 1 is a deliberate edge case: a 500ml bottle),
    // a one-off event kit (LUMP_SUM), and the salon's own space/chair rented
    // out rather than a treatment sold to a walk-in client (DAY).
    {
      key: 'HUILE-MASSAGE500',
      name: 'Huile de massage neutre (flacon 500ml)',
      unit: Unit.LITER,
      priceCents: 1400,
      packagingQuantity: '0.5',
      folderKeys: ['corps'],
    },
    {
      key: 'GEL-DOUCHE5L',
      name: 'Gel douche professionnel (bidon 5L, usage cabine)',
      unit: Unit.LITER,
      priceCents: 800,
      packagingQuantity: '5',
      folderKeys: ['corps'],
    },
    {
      key: 'KIT-EVENEMENTIEL',
      name: 'Kit consommables usage unique (événementiel)',
      unit: Unit.LUMP_SUM,
      priceCents: 3500,
      folderKeys: ['groupe'],
    },
    // Sub-letting a chair/room to an independent professional is a real,
    // fairly common revenue stream for a salon — a completely different
    // customer relationship (a fellow professional, not a retail client)
    // from every other line in this catalog. See F-000007 below.
    {
      key: 'LOC-POSTE-JOUR',
      name: 'Location poste de travail indépendant (à la journée)',
      unit: Unit.DAY,
      priceCents: 4000,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
    // Cataloged but never invoiced in the seed below — a realistic "new
    // offering just added, no takers yet" catalog entry.
    {
      key: 'LOC-SALLE-ATELIER',
      name: 'Location salle pour atelier/formation (journée)',
      unit: Unit.DAY,
      priceCents: 25000,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  ];

  for (const p of productDefs) {
    await prisma.product.create({
      data: {
        companyId: company.id,
        code: p.key,
        name: p.name,
        unit: p.unit,
        priceCents: p.priceCents,
        packagingQuantity: p.packagingQuantity,
        supplierName: p.supplierName,
        activityCategory: p.activityCategory ?? ActivityCategory.VENTE_MARCHANDISES,
        folders: p.folderKeys
          ? { connect: p.folderKeys.map((key) => ({ id: folders.get(key)! })) }
          : undefined,
      },
    });
  }

  const serviceDefs: ServiceDef[] = [
    { key: 'coupe-brushing', name: 'Coupe + Brushing', priceCents: 4500 },
    { key: 'coloration', name: 'Coloration complète', priceCents: 7500 },
    { key: 'balayage', name: 'Balayage', priceCents: 9500 },
    {
      key: 'maquillage-jour',
      name: 'Maquillage jour',
      priceCents: 3500,
      folderKeys: ['visage'],
    },
    {
      key: 'maquillage-soiree',
      name: 'Maquillage soirée',
      priceCents: 5500,
      folderKeys: ['visage'],
    },
    {
      key: 'forfait-mariage',
      name: 'Forfait maquillage + coiffure mariée',
      priceCents: 25000,
      // The one item in this tenant's catalog exercising the many-to-many
      // folder picker: a bridal face package that's also a group/event
      // booking.
      folderKeys: ['visage', 'groupe'],
    },
    {
      key: 'retouche-mariage',
      name: 'Retouche maquillage sur place (mariage)',
      description: 'Déplacement en cours de soirée pour une retouche',
      priceCents: 4000,
      folderKeys: ['groupe'],
    },
    {
      key: 'consultation-diagnostic',
      name: 'Consultation colorimétrie / diagnostic peau',
      priceCents: 2500,
      folderKeys: ['visage'],
    },
  ];

  const services = new Map<string, string>();
  for (const s of serviceDefs) {
    const row = await prisma.service.create({
      data: {
        companyId: company.id,
        code: s.key,
        name: s.name,
        description: s.description,
        pricingMode: ServicePricingMode.FIXED,
        priceCents: s.priceCents,
        activityCategory: ActivityCategory.PRESTATION_BIC,
        folders: s.folderKeys
          ? { connect: s.folderKeys.map((key) => ({ id: folders.get(key)! })) }
          : undefined,
      },
    });
    services.set(s.key, row.id);
  }

  const domicileRow = await prisma.service.create({
    data: {
      companyId: company.id,
      code: 'domicile',
      name: 'Prestation à domicile (majoration déplacement)',
      pricingMode: ServicePricingMode.FIXED,
      priceCents: 2000,
      defaultVisibility: ServiceVisibility.REDISTRIBUTED,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  });
  services.set('domicile', domicileRow.id);

  // PERCENTAGE mode doesn't have to be hidden/redistributed — a mandatory
  // group service charge is just as often its own explicit, visible line.
  const groupeRow = await prisma.service.create({
    data: {
      companyId: company.id,
      code: 'supplement-groupe',
      name: 'Supplément service groupe (EVJF, EVJG, événement)',
      description: 'Majoration appliquée aux réservations de groupe',
      pricingMode: ServicePricingMode.PERCENTAGE,
      percentageBasisPoints: 1000,
      defaultVisibility: ServiceVisibility.VISIBLE,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  });
  services.set('supplement-groupe', groupeRow.id);

  // Same workaround as Bâti Rénov's "Sous-traitance ..." services above —
  // see the comment there and docs/roadmap.md Phase 28. Still better than
  // one lump freehand line (at least traceable via "Statistiques >
  // Meilleures prestations"), but not a real "what do I owe this freelancer"
  // ledger.
  const freelanceRow = await prisma.service.create({
    data: {
      companyId: company.id,
      code: 'stt-maquilleuses-freelance',
      name: 'Sous-traitance maquilleuses freelance (x4, prestataires indépendantes)',
      description: 'Refacturé au client au prix coûtant — équipe freelance pour événements',
      pricingMode: ServicePricingMode.FIXED,
      priceCents: 144000,
      activityCategory: ActivityCategory.PRESTATION_BIC,
    },
  });
  services.set('stt-maquilleuses-freelance', freelanceRow.id);

  const discounts = await createDiscounts(company.id, folders, [
    {
      key: 'fidelite',
      name: 'Remise cliente fidèle',
      discountType: DiscountType.FIXED,
      fixedAmountCents: 1000,
    },
    {
      key: 'groupe',
      name: 'Remise groupe (3 personnes ou plus)',
      discountType: DiscountType.PERCENTAGE,
      percentageBasisPoints: 1500,
      folderKeys: ['groupe'],
    },
  ]);

  await createDocuments(company.id, customers, services, discounts, [
    {
      number: 'F-000001',
      date: '2026-01-15',
      customerKey: 'petit',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-01-15',
      lines: [
        {
          description: 'Shampoing professionnel sans sulfate 250ml',
          unit: Unit.UNIT,
          quantity: '1',
          unitPriceCents: 1890,
          productCode: 'SHP-PRO250',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'coupe-brushing',
          name: 'Coupe + Brushing',
          amountCents: 4500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'F-000002',
      date: '2026-03-02',
      customerKey: 'nguyen',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-03-02',
      lines: [
        {
          description: 'Sérum réparateur capillaire 50ml',
          unit: Unit.UNIT,
          quantity: '1',
          unitPriceCents: 2490,
          productCode: 'SER-CAP50',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'coloration',
          name: 'Coloration complète',
          amountCents: 7500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'F-000003',
      date: '2026-05-18',
      customerKey: 'ferrand',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.NON_PAYEE,
      dueDate: '2026-06-01',
      serviceLines: [
        {
          serviceKey: 'balayage',
          name: 'Balayage',
          amountCents: 9500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'maquillage-jour',
          name: 'Maquillage jour',
          amountCents: 3500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'F-000004',
      date: '2026-07-05',
      customerKey: 'petit',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.NON_PAYEE,
      dueDate: '2026-08-01',
      lines: [
        {
          description: 'Fond de teint longue tenue 30ml',
          unit: Unit.UNIT,
          quantity: '1',
          unitPriceCents: 3200,
          productCode: 'FDT-30ML',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Palette maquillage 12 teintes',
          unit: Unit.UNIT,
          quantity: '1',
          unitPriceCents: 4500,
          productCode: 'PAL-MAQ12',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'maquillage-soiree',
          name: 'Maquillage soirée',
          amountCents: 5500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'domicile',
          name: 'Prestation à domicile (majoration déplacement)',
          amountCents: 2000,
          visibility: ServiceVisibility.REDISTRIBUTED,
          redistribute: true,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'DEV-000001',
      documentType: DocumentType.DEVIS,
      date: '2026-06-10',
      customerKey: 'agence-prisme',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      serviceLines: [
        {
          serviceKey: 'stt-maquilleuses-freelance',
          name: 'Sous-traitance maquilleuses freelance (x4, prestataires indépendantes)',
          amountCents: 144000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          name: 'Coordination & encadrement événementiel',
          description: 'Brief, planning et supervision de l’équipe sur place',
          amountCents: 36000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'F-000005',
      date: '2026-06-25',
      customerKey: 'agence-prisme',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-07-01',
      convertedFromDevisNumber: 'DEV-000001',
      // Phase 1.1-1: the real photo-signature example for this tenant — a
      // signed B2B event contract, photographed and attached.
      attachSignaturePhoto: true,
      serviceLines: [
        {
          serviceKey: 'stt-maquilleuses-freelance',
          name: 'Sous-traitance maquilleuses freelance (x4, prestataires indépendantes)',
          amountCents: 144000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          name: 'Coordination & encadrement événementiel',
          description: 'Brief, planning et supervision de l’équipe sur place',
          amountCents: 36000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      number: 'DEV-000002',
      documentType: DocumentType.DEVIS,
      date: '2026-07-18',
      customerKey: 'moreau',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      lines: [
        {
          description: 'Palette maquillage 12 teintes',
          unit: Unit.UNIT,
          quantity: '1',
          unitPriceCents: 4500,
          productCode: 'PAL-MAQ12',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Set vernis à ongles (x3)',
          unit: Unit.UNIT,
          quantity: '1',
          unitPriceCents: 1500,
          productCode: 'VERNIS-SET',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'forfait-mariage',
          name: 'Forfait maquillage + coiffure mariée',
          amountCents: 25000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      // A group booking (EVJF) — several different treatments on one
      // invoice, retail products billed by volume with sub-1 packaging, a
      // one-off event kit, and a mandatory group surcharge shown as its own
      // visible PERCENTAGE line rather than hidden/redistributed.
      number: 'F-000006',
      date: '2026-07-22',
      customerKey: 'girard',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-07-22',
      lines: [
        {
          description: 'Huile de massage neutre',
          unit: Unit.LITER,
          quantity: '1.5',
          unitPriceCents: 1400,
          packagingQuantity: '0.5',
          productCode: 'HUILE-MASSAGE500',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
        {
          description: 'Kit consommables usage unique',
          unit: Unit.LUMP_SUM,
          quantity: '1',
          unitPriceCents: 3500,
          productCode: 'KIT-EVENEMENTIEL',
          activityCategory: ActivityCategory.VENTE_MARCHANDISES,
        },
      ],
      serviceLines: [
        {
          serviceKey: 'maquillage-jour',
          name: 'Maquillage jour',
          amountCents: 3500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'coupe-brushing',
          name: 'Coupe + Brushing',
          amountCents: 4500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'balayage',
          name: 'Balayage',
          amountCents: 9500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'supplement-groupe',
          name: 'Supplément service groupe (EVJF)',
          amountCents: 2310,
          visibility: ServiceVisibility.VISIBLE,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      // Not a retail client at all — a fellow independent professional
      // renting a chair for the week, billed by the day. Single-line
      // invoice, on the opposite end of the complexity spectrum from
      // F-000006 above.
      number: 'F-000007',
      date: '2026-07-15',
      customerKey: 'vidal',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-07-15',
      // Phase 1.1-1: the freehand fallback — checked by hand, no photo/drawn
      // proof attached.
      manuallySigned: true,
      lines: [
        {
          description: 'Location poste de travail indépendant — semaine du 14/07',
          unit: Unit.DAY,
          quantity: '5',
          unitPriceCents: 4000,
          productCode: 'LOC-POSTE-JOUR',
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
    },
    {
      // Phase 1.1-2/32: a second group booking, this time actually using the
      // "Prestations groupe" folder's remise — same client as F-000006, a
      // real example of the -15% group discount folding into the subtotal.
      number: 'F-000008',
      date: '2026-08-05',
      customerKey: 'girard',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.PAYEE,
      paidAt: '2026-08-05',
      serviceLines: [
        {
          serviceKey: 'balayage',
          name: 'Balayage',
          amountCents: 9500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'maquillage-soiree',
          name: 'Maquillage soirée',
          amountCents: 5500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'supplement-groupe',
          name: 'Supplément service groupe (EVJF)',
          amountCents: 1500,
          visibility: ServiceVisibility.VISIBLE,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
      discountLines: [
        {
          discountKey: 'groupe',
          name: 'Remise groupe (3 personnes ou plus)',
          amountCents: 2325,
        },
      ],
    },
    {
      // Phase 1.1-3's opt-in deposit path — unlike Bâti Rénov, this tenant
      // has no defaultDepositPercentageBasisPoints, so the toggle starts off
      // and this deposit was typed in by hand. Still NON_PAYEE.
      number: 'F-000009',
      date: '2026-08-08',
      customerKey: 'moreau',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.NON_PAYEE,
      dueDate: '2026-09-12',
      serviceLines: [
        {
          serviceKey: 'forfait-mariage',
          name: 'Forfait maquillage + coiffure mariée',
          amountCents: 25000,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
      depositPercentageBasisPoints: 4000,
      depositAmountCents: 10000,
    },
    {
      // The other deposit state for this tenant: requested and received —
      // ACOMPTE_VERSE, same opt-in path as F-000009 above.
      number: 'F-000010',
      date: '2026-08-11',
      customerKey: 'fontaine',
      vatApplicable: false,
      vatRateBasisPoints: 0,
      status: InvoiceStatus.ACOMPTE_VERSE,
      dueDate: '2026-09-01',
      serviceLines: [
        {
          serviceKey: 'coloration',
          name: 'Coloration complète',
          amountCents: 7500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
        {
          serviceKey: 'balayage',
          name: 'Balayage',
          amountCents: 9500,
          activityCategory: ActivityCategory.PRESTATION_BIC,
        },
      ],
      depositPercentageBasisPoints: 3000,
      depositAmountCents: 5100,
      depositPaidAt: '2026-08-12',
    },
  ]);
}

async function main() {
  await wipeExistingDemoData();
  await seedArtisanBatiment();
  await seedInstitutBeaute();

  console.log('');
  console.log('Demo data seeded:');
  console.log(
    `  Artisan bâtiment (Bâti Rénov)     — ${DEMO_ARTISAN_EMAIL} / ${DEMO_ARTISAN_PASSWORD}`,
  );
  console.log(
    `  Institut de beauté (L'Atelier Beauté) — ${DEMO_BEAUTE_EMAIL} / ${DEMO_BEAUTE_PASSWORD}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

// `make demo`'s one-click login (see Makefile, infra/demo-seed.sh) — the
// fixed list of demo tenants and which seeded User each logs into. Shared by
// AuthController/AuthService's demo-profiles/demo-login endpoints AND by
// backend/prisma/seed-demo.ts, which creates these exact Users — this file
// is the single source of truth for the mapping, so the two can never drift
// apart. Deliberately plain data with zero Nest imports: the standalone seed
// script runs outside the Nest application, straight against Prisma, and
// must not pull in the DI tree by importing it.
export interface DemoProfile {
  key: string;
  label: string;
  email: string;
}

export const DEMO_PROFILES: readonly DemoProfile[] = [
  {
    key: 'artisan',
    label: 'Bâti Rénov — Artisan du bâtiment',
    email: 'demo.artisan@facturele.app',
  },
  {
    key: 'beaute',
    label: 'L’Atelier Beauté — Institut de beauté',
    email: 'demo.beaute@facturele.app',
  },
];

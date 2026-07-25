import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

// Phase 13: every feature route below needs a valid session — wrapped as
// children of one pathless, authGuard-protected route rather than
// repeating `canActivate: [authGuard]` on each top-level entry.
const protectedRoutes: Routes = [
  {
    // Phase 9.5: "nouvelle facture" first opens a mode-choice screen, then
    // either the pre-existing rapide/ shell (unchanged, just moved one path
    // segment deeper) or the new manuel/ free-form canvas. Mode switching
    // mid-draft is deliberately unsupported — each mode has its own,
    // independent draft store, and there is no shared parent component
    // between them beyond this route grouping.
    path: 'factures/nouvelle',
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/invoice-create/mode-choice/invoice-create-mode-choice.page').then(
            (m) => m.InvoiceCreateModeChoicePage,
          ),
      },
      {
        path: 'rapide',
        loadComponent: () =>
          import('./features/invoice-create/invoice-create-shell.page').then(
            (m) => m.InvoiceCreateShellPage,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'client' },
          {
            path: 'client',
            loadComponent: () =>
              import('./features/invoice-create/customer-step/invoice-create-customer-step.page').then(
                (m) => m.InvoiceCreateCustomerStepPage,
              ),
          },
          {
            path: 'lignes',
            loadComponent: () =>
              import('./features/invoice-create/lines-step/invoice-create-lines-step.page').then(
                (m) => m.InvoiceCreateLinesStepPage,
              ),
          },
          // Phase 15: mandatory preview step — "Créer la facture" only
          // lives here now, not on the lignes step above.
          {
            path: 'apercu',
            loadComponent: () =>
              import('./features/invoice-create/preview-step/invoice-create-preview-step.page').then(
                (m) => m.InvoiceCreatePreviewStepPage,
              ),
          },
        ],
      },
      {
        path: 'manuel',
        loadComponent: () =>
          import('./features/invoice-create/manual/invoice-create-manual.page').then(
            (m) => m.InvoiceCreateManualPage,
          ),
      },
    ],
  },
  {
    path: 'factures',
    loadComponent: () =>
      import('./features/invoice-list/invoice-list.page').then((m) => m.InvoiceListPage),
  },
  {
    path: 'clients',
    loadComponent: () =>
      import('./features/customer-list/customer-list.page').then((m) => m.CustomerListPage),
  },
  {
    path: 'clients/nouveau',
    loadComponent: () =>
      import('./features/customer-form/customer-form.page').then((m) => m.CustomerFormPage),
  },
  {
    path: 'clients/:id',
    loadComponent: () =>
      import('./features/customer-form/customer-form.page').then((m) => m.CustomerFormPage),
  },
  {
    path: 'produits',
    loadComponent: () =>
      import('./features/product-list/product-list.page').then((m) => m.ProductListPage),
  },
  {
    path: 'produits/nouveau',
    loadComponent: () =>
      import('./features/product-form/product-form.page').then((m) => m.ProductFormPage),
  },
  {
    path: 'produits/:id',
    loadComponent: () =>
      import('./features/product-form/product-form.page').then((m) => m.ProductFormPage),
  },
  {
    path: 'prestations',
    loadComponent: () =>
      import('./features/service-list/service-list.page').then((m) => m.ServiceListPage),
  },
  {
    path: 'prestations/nouvelle',
    loadComponent: () =>
      import('./features/service-form/service-form.page').then((m) => m.ServiceFormPage),
  },
  {
    path: 'prestations/:id',
    loadComponent: () =>
      import('./features/service-form/service-form.page').then((m) => m.ServiceFormPage),
  },
  {
    path: 'entreprise',
    loadComponent: () =>
      import('./features/company-settings/company-settings.page').then(
        (m) => m.CompanySettingsPage,
      ),
  },
  {
    path: 'abonnement',
    loadComponent: () => import('./features/billing/subscribe.page').then((m) => m.SubscribePage),
  },
  // Phase 14 admin dashboard — reachable by any authenticated user at the
  // route level (adminGuard does the real gate), same defense-in-depth
  // posture as the backend's RolesGuard: a non-admin hitting this URL
  // directly is redirected, never shown an empty/broken admin shell.
  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/admin/admin-users.page').then((m) => m.AdminUsersPage),
      },
      {
        path: 'codes-promo',
        loadComponent: () =>
          import('./features/admin/admin-promo-codes.page').then((m) => m.AdminPromoCodesPage),
      },
    ],
  },
];

export const routes: Routes = [
  // Phase 13.3: the public landing page owns '/' — guestGuard bounces an
  // already-signed-in artisan straight into the app instead of showing them
  // the pitch meant for strangers. `fullBleed` route data lets app.html
  // opt this one page out of the app shell's `max-w-3xl` content container
  // (see App.isFullBleed) — a marketing page needs full-width hero
  // sections, every other route is a form/list that wants that width cap.
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    data: { fullBleed: true },
    loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage),
  },
  // Public auth/legal routes — no session required, must never sit behind
  // authGuard (login/register are how a session gets established at all).
  {
    path: 'connexion',
    loadComponent: () => import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'inscription',
    loadComponent: () =>
      import('./features/auth/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'mot-de-passe-oublie',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.page').then(
        (m) => m.ForgotPasswordPage,
      ),
  },
  {
    path: 'reinitialiser-mot-de-passe',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'verifier-email',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email.page').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'cgu',
    loadComponent: () => import('./features/legal/cgu/cgu.page').then((m) => m.CguPage),
  },
  {
    path: 'confidentialite',
    loadComponent: () =>
      import('./features/legal/confidentialite/confidentialite.page').then(
        (m) => m.ConfidentialitePage,
      ),
  },
  { path: '', canActivate: [authGuard], children: protectedRoutes },
];

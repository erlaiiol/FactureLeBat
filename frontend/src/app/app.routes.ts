import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'factures/nouvelle' },
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
];

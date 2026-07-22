import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'factures/nouvelle' },
  {
    path: 'factures/nouvelle',
    loadComponent: () =>
      import('./features/invoice-create/invoice-create.page').then((m) => m.InvoiceCreatePage),
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
    path: 'entreprise',
    loadComponent: () =>
      import('./features/company-settings/company-settings.page').then(
        (m) => m.CompanySettingsPage,
      ),
  },
];

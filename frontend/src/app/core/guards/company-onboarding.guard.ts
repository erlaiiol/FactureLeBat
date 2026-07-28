import { CanDeactivateFn } from '@angular/router';
import { CompanySettingsPage } from '../../features/company-settings/company-settings.page';

// Closes the gap guestGuard's comment calls out deliberately: a first-login
// artisan routed to /entreprise?onboarding=1 could until now click straight
// past it via the header nav before saving a single field, leaving
// DEFAULT_COMPANY_PROFILE's blanks on their first invoice. This only bites
// while `onboarding` is true (CompanySettingsPage.canDeactivate checks the
// query param itself) — once the essential identity fields have been saved
// once, or on any later visit without that query param, it's a no-op, same
// as guestGuard not nagging a returning artisan.
export const companyOnboardingGuard: CanDeactivateFn<CompanySettingsPage> = (
  component,
  _currentRoute,
  _currentState,
  nextState,
) => {
  // Logging out must always work regardless of profile completeness —
  // trapping someone who wants to abandon the session entirely would be
  // hostile, not just "forcing completion a bit more".
  if (nextState.url.startsWith('/connexion')) {
    return true;
  }
  return component.canDeactivate();
};

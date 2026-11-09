export const APP_STORE_URL =
  'https://apps.apple.com/fr/app/facturele-factures-devis-stats/id6811579848';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=fr.facturele.app&pcampaignid=web_share';

// /connexion is already registered in the released Android intent filter.
export const ANDROID_APP_INTENT =
  'intent://facturele.net/connexion#Intent;scheme=https;package=fr.facturele.app;' +
  `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;

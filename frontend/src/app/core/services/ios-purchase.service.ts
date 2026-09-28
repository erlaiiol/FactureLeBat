import { Injectable, NgZone, inject } from '@angular/core';
import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

// Thrown by purchase() when the artisan dismissed StoreKit's system
// purchase sheet — distinguishable from a real failure, same
// "cancellation isn't an error" precedent as AppleNativeLoginCancelledError/
// GoogleNativeLoginCancelledError.
export class IosPurchaseCancelledError extends Error {}

// Thrown when the purchase is pending an external approval (Ask to Buy /
// family sharing) — no transaction to act on yet; a later
// 'transactionsUpdated' event delivers it once resolved (see
// StoreKitPurchasePlugin.swift's Transaction.updates listener).
export class IosPurchasePendingError extends Error {}

interface TransactionJws {
  transactionJWS: string;
}

// Mirrors StoreKitPurchasePlugin.swift's 3 exported methods exactly — see
// that file for the native implementation. A local Capacitor plugin (lives
// in ios/App/App/Plugins/, not an npm package), so this interface is the
// only place its JS-visible shape is declared.
export interface StoreKitPurchasePlugin {
  purchase(options: { productId: string }): Promise<TransactionJws>;
  restorePurchases(): Promise<{ transactions: TransactionJws[] }>;
  getActiveEntitlements(): Promise<{ transactions: TransactionJws[] }>;
  addListener(
    eventName: 'transactionsUpdated',
    listenerFunc: (event: TransactionJws) => void,
  ): Promise<PluginListenerHandle>;
}

const StoreKitPurchase = registerPlugin<StoreKitPurchasePlugin>('StoreKitPurchase');

// Phase 1.7: native iOS In-App Purchase, the StoreKit2 counterpart to
// BillingService's Stripe checkout — every method here only ever hands back
// a raw transaction JWS *string*, never a parsed/trusted object, because the
// backend (POST /billing/apple/verify-purchase) independently re-verifies
// it against Apple's own certificates before ever crediting a tier. This
// service does no verification of its own beyond what StoreKit2 itself
// already guarantees client-side.
//
// iOS-only by construction — subscribe.page.ts is the only caller, gated by
// platformService.isIosApp(), same as AppleNativeLoginService only being
// reachable from the iOS-gated part of login.page.html.
@Injectable({ providedIn: 'root' })
export class IosPurchaseService {
  private readonly zone = inject(NgZone);

  async purchase(productId: string): Promise<string> {
    try {
      const { transactionJWS } = await StoreKitPurchase.purchase({ productId });
      return transactionJWS;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'USER_CANCELLED') {
        throw new IosPurchaseCancelledError();
      }
      if (code === 'PENDING') {
        throw new IosPurchasePendingError();
      }
      throw error;
    }
  }

  // Apple guideline 3.1.2's mandatory "Restore Purchases" action —
  // AppStore.sync() refreshes this device's transaction state from Apple
  // first, so this can prompt for the Apple ID password; every currently
  // active entitlement's JWS comes back for the caller to re-verify against
  // the backend, same as a fresh purchase() result.
  async restorePurchases(): Promise<string[]> {
    const { transactions } = await StoreKitPurchase.restorePurchases();
    return transactions.map((t) => t.transactionJWS);
  }

  // Read-only equivalent of restorePurchases, without the network round
  // trip/credential prompt — a quiet reconciliation check, not the explicit
  // "Restaurer mes achats" button.
  async getActiveEntitlements(): Promise<string[]> {
    const { transactions } = await StoreKitPurchase.getActiveEntitlements();
    return transactions.map((t) => t.transactionJWS);
  }

  // Fires for a transaction that arrives outside any purchase()/
  // restorePurchases() call this session — a renewal while backgrounded, an
  // Ask-to-Buy approval, a purchase made on another device (see
  // StoreKitPurchasePlugin.swift's Transaction.updates listener, which runs
  // for the app's entire lifetime, not just around an explicit call here).
  // Wrapped in NgZone.run since Capacitor plugin listener callbacks fire
  // outside Angular's zone.
  onTransactionUpdated(callback: (transactionJWS: string) => void): Promise<PluginListenerHandle> {
    return StoreKitPurchase.addListener('transactionsUpdated', (event) => {
      this.zone.run(() => callback(event.transactionJWS));
    });
  }
}

import Capacitor
import StoreKit

// Phase 1.7: native StoreKit2 In-App Purchase, wrapped as a local Capacitor
// plugin (lives directly in the App target — not a separate npm package,
// same "custom native iOS code" pattern Capacitor's own docs describe for
// code that only this app needs). The corresponding TypeScript side is
// core/services/ios-purchase.service.ts.
//
// This class deliberately only ever hands back the JWS *string*
// (VerificationResult.jwsRepresentation) for a transaction, never a parsed
// object — the backend (AppleServerClientService, App Store Server Library)
// re-verifies that JWS against Apple's own certificates independently. The
// client-side `VerificationResult` check below is StoreKit2's own signature
// check (useful to fail fast on an obviously-tampered result before ever
// calling the network), not a substitute for server-side verification —
// see docs/1.7/1.7-2-backend-apple-purchase-verification.md.
//
// NOT YET BUILD/RUN-VERIFIED IN XCODE — written and reasoned through
// against Apple's public StoreKit2 API, but this environment has no Mac/
// Xcode to compile or exercise it (same caveat this project's other
// native-only pieces, e.g. Sign in with Apple, already carry — see
// docs/roadmap.md Phase 1.5's "Current state" section). Verify by adding
// this file (and its .m counterpart) to the "App" target in Xcode, then
// exercising a purchase against a sandbox tester account or a local
// StoreKit Configuration file before treating this as store-ready.
@objc(StoreKitPurchasePlugin)
public class StoreKitPurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPurchasePlugin"
    public let jsName = "StoreKitPurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveEntitlements", returnType: CAPPluginReturnPromise),
    ]

    private var transactionListenerTask: Task<Void, Never>?

    // Apple's own StoreKit2 guidance: a transaction can arrive outside any
    // explicit purchase() call (a renewal while the app was backgrounded, an
    // Ask-to-Buy approval, a purchase made on another device) — Transaction.
    // updates must be listened to for the app's entire lifetime, not just
    // during an explicit purchase. Each new transaction is forwarded to the
    // JS side as a "transactionsUpdated" event; IosPurchaseService listens
    // and re-verifies it against the backend the same way a fresh purchase
    // would be.
    override public func load() {
        transactionListenerTask = Task.detached { [weak self] in
            for await update in Transaction.updates {
                guard let self else { return }
                if case .verified = update {
                    await update.payload.finish()
                }
                self.notifyListeners("transactionsUpdated", data: [
                    "transactionJWS": update.jwsRepresentation,
                ])
            }
        }
    }

    deinit {
        transactionListenerTask?.cancel()
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("PRODUCT_NOT_FOUND", "No App Store product found for id \(productId)")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    if case .verified(let transaction) = verification {
                        await transaction.finish()
                    }
                    call.resolve(["transactionJWS": verification.jwsRepresentation])
                case .userCancelled:
                    call.reject("USER_CANCELLED", "The artisan dismissed the purchase sheet.")
                case .pending:
                    // Ask to Buy (family sharing) or another pending payment
                    // state — no transaction to hand back yet, a later
                    // Transaction.updates event (above) delivers it once
                    // resolved.
                    call.reject("PENDING", "Purchase is pending approval.")
                @unknown default:
                    call.reject("UNKNOWN", "Unknown StoreKit purchase result.")
                }
            } catch {
                call.reject("PURCHASE_FAILED", error.localizedDescription, error)
            }
        }
    }

    // Apple guideline 3.1.2: mandatory "Restore Purchases" action. AppStore.
    // sync() refreshes this device's local transaction/entitlement state
    // from Apple (prompts for the Apple ID password if needed), then every
    // currently active entitlement's JWS is handed back for the backend to
    // re-verify and re-link, same shape as a fresh purchase.
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let jwsList = await currentEntitlementJWSList()
                call.resolve(["transactions": jwsList.map { ["transactionJWS": $0] }])
            } catch {
                call.reject("RESTORE_FAILED", error.localizedDescription, error)
            }
        }
    }

    // Read-only equivalent of restorePurchases, without AppStore.sync()'s
    // network round trip/credential prompt — useful for a quiet reconciliation
    // check (e.g. on app launch) rather than the explicit "Restaurer mes
    // achats" button.
    @objc func getActiveEntitlements(_ call: CAPPluginCall) {
        Task {
            let jwsList = await currentEntitlementJWSList()
            call.resolve(["transactions": jwsList.map { ["transactionJWS": $0] }])
        }
    }

    private func currentEntitlementJWSList() async -> [String] {
        var jwsList: [String] = []
        for await entitlement in Transaction.currentEntitlements {
            jwsList.append(entitlement.jwsRepresentation)
        }
        return jwsList
    }
}

import { IsString, IsNotEmpty } from 'class-validator';

// Phase 1.7: posted by the frontend right after a StoreKit2 purchase
// completes — the raw signedTransactionInfo JWS string StoreKit2/the native
// plugin hands back (Transaction.jsonRepresentation's signed form, not a
// parsed object), verified server-side by AppleServerClientService. Never
// trusted as-is: BillingService.verifyApplePurchase re-derives
// productId/originalTransactionId from the verified payload, exactly like
// createCheckoutSession never trusts a client-supplied price.
export class VerifyApplePurchaseDto {
  @IsString()
  @IsNotEmpty()
  signedTransactionInfo: string;
}

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { InvoiceWithTotals } from '../core/models/invoice.model';
import { FileDownloadService } from '../core/services/file-download.service';
import { NativeFileShareService } from '../core/services/native-file-share.service';
import { PlatformService } from '../core/services/platform.service';
import { ToastService } from '../core/services/toast.service';

// Specs only. Shared setup for "does this real component's Télécharger
// button still work inside the Android/iOS shell?" — the 2026-10-07 bug
// where a link inside a container that stopped click propagation (board row
// actions <td>, ModalMorphComponent's panel) silently did nothing in the
// Android WebView. FileDownloadService's own spec covers the mechanism on a
// hand-built link; component specs using this cover the real templates,
// with their real containers, which is what that spec alone missed.

export interface NativeShellTestContext {
  http: HttpTestingController;
  nativeShare: { share: ReturnType<typeof vi.fn> };
  toast: {
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
}

export function nativeShellProviders(
  nativeShare: NativeShellTestContext['nativeShare'],
  toast: NativeShellTestContext['toast'],
): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: PlatformService, useValue: { isNativeApp: signal(true), isIosApp: signal(false) } },
    { provide: NativeFileShareService, useValue: nativeShare },
    { provide: ToastService, useValue: toast },
  ];
}

// Call after TestBed.configureTestingModule({ providers: [...nativeShellProviders(...)] }).
// Installs the same document-level interception App's constructor does.
export function startNativeShell(): HttpTestingController {
  TestBed.inject(FileDownloadService).interceptApiLinks();
  return TestBed.inject(HttpTestingController);
}

export function createNativeShellDoubles(): Omit<NativeShellTestContext, 'http'> {
  return {
    nativeShare: { share: vi.fn().mockResolvedValue(undefined) },
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  };
}

// A real tap: dispatched on the link's innermost element, bubbling, cancelable.
export function tap(element: Element): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  (element.firstElementChild ?? element).dispatchEvent(event);
  return event;
}

export async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function pdfBlob(): Blob {
  return new Blob(['%PDF-1.3'], { type: 'application/pdf' });
}

export function buildInvoice(overrides: Partial<InvoiceWithTotals> = {}): InvoiceWithTotals {
  return {
    id: 'inv-1',
    number: 'F-000042',
    date: '2026-10-01T00:00:00.000Z',
    customerName: 'Client Test',
    customerAddress: null,
    customerEmail: null,
    customerPhone: null,
    customerSiret: null,
    deliveryAddress: null,
    customerId: null,
    customerFields: [],
    documentType: 'FACTURE',
    convertedFromDevisId: null,
    convertedToFacture: null,
    createdFromFactureId: null,
    retroactiveDevis: null,
    vatApplicable: true,
    vatRateBasisPoints: 2000,
    entryMode: 'GUIDED',
    lines: [],
    serviceLines: [],
    discountLines: [],
    subtotalExclVatCents: 10000,
    vatAmountCents: 2000,
    totalInclVatCents: 12000,
    sentAt: null,
    sentToEmail: null,
    status: 'NON_PAYEE',
    dueDate: null,
    paidAt: null,
    lastReminderAt: null,
    simplifiedDisplay: 'NONE',
    hasSignatureProof: false,
    signatureMethod: null,
    manuallySigned: false,
    eInvoiceTransmissionStatus: 'NOT_SENT',
    eInvoiceTransmittedAt: null,
    eInvoiceRejectionReason: null,
    facturXUsed: false,
    scheduledTransmitAt: null,
    depositPercentageBasisPoints: null,
    depositAmountCents: null,
    depositPaidAt: null,
    reverseChargeApplicable: false,
    manualNatureOfOperation: null,
    ...overrides,
  };
}

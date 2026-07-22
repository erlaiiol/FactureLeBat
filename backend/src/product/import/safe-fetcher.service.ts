import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { isBlockedIp } from './ip-guard';
import { ProductImportUnavailableError } from './product-import-unavailable.error';

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

// Resolves DNS itself and rejects any hostname that resolves to a
// blocked address, then hands the *same already-resolved* address to the
// real connector. This is what actually closes the DNS-rebinding gap: a
// separate "check the IP, then fetch(url)" would let a malicious DNS
// server return a public IP for the check and a private one moments later
// for the real connection. Passed as undici's `connect.lookup`, so it runs
// once per TCP connection — including for every redirect hop, since each
// new origin opens a fresh connection through the same dispatcher.
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', undefined);
      return;
    }
    if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
      callback(new Error(`Refusing to connect to ${hostname}: blocked address`), '', undefined);
      return;
    }
    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

// Isolated from ProductExtractionService on purpose: this class only ever
// knows about network I/O (fetching, redirect-following, size/time/content
// -type limits) and never touches HTML parsing, matching the same
// "isolate the risky boundary" split as PdfService (see conventions.md).
@Injectable()
export class SafeFetcherService implements OnModuleDestroy {
  private readonly logger = new Logger(SafeFetcherService.name);
  private readonly agent = new Agent({
    connect: { lookup: safeLookup, timeout: REQUEST_TIMEOUT_MS },
  });

  // Closes pooled keep-alive sockets on app shutdown/hot-reload — without
  // this, `nest start --watch` restarts (or a container SIGTERM) leak open
  // connections to whatever supplier sites were last fetched. Only fires if
  // the app itself calls enableShutdownHooks() (see main.ts) or app.close(),
  // same as PrismaService's onModuleDestroy.
  async onModuleDestroy(): Promise<void> {
    await this.agent.close();
  }

  async fetchHtml(url: string): Promise<string> {
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const parsed = this.parseHttpUrl(currentUrl);

      let response: Awaited<ReturnType<typeof undiciFetch>>;
      try {
        response = await undiciFetch(parsed.toString(), {
          dispatcher: this.agent,
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { accept: 'text/html' },
        });
      } catch (error) {
        this.logger.warn(`Import fetch failed for ${this.redactUrl(currentUrl)}: ${String(error)}`);
        throw new ProductImportUnavailableError('Unable to reach this URL');
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new ProductImportUnavailableError('Redirect without a location');
        }
        currentUrl = new URL(location, parsed).toString();
        continue;
      }

      if (!response.ok) {
        throw new ProductImportUnavailableError(`Unexpected status ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('text/html')) {
        throw new ProductImportUnavailableError(`Unexpected content type: ${contentType}`);
      }

      return this.readBounded(response);
    }

    throw new ProductImportUnavailableError('Too many redirects');
  }

  private parseHttpUrl(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ProductImportUnavailableError('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ProductImportUnavailableError('Only http/https URLs are supported');
    }
    return parsed;
  }

  private async readBounded(response: Awaited<ReturnType<typeof undiciFetch>>): Promise<string> {
    const reader = response.body?.getReader() as
      ReadableStreamDefaultReader<Uint8Array> | undefined;
    if (!reader) {
      return '';
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value }: ReadableStreamReadResult<Uint8Array> = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProductImportUnavailableError('Response too large');
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  // Keeps the path/query out of logs — the host alone is enough to debug a
  // blocked-import report without persisting whatever an artisan pasted.
  private redactUrl(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return '(invalid url)';
    }
  }
}

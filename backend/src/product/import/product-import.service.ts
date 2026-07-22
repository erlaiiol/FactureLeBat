import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SafeFetcherService } from './safe-fetcher.service';
import { ProductExtractionService } from './product-extraction.service';
import { ProductImportUnavailableError } from './product-import-unavailable.error';
import { ImportedProductDraft } from './entities/imported-product.entity';

// Orchestration only, same role as InvoiceService: delegates fetching to
// SafeFetcherService and parsing to ProductExtractionService, and never
// touches Prisma — nothing here is persisted, it only ever returns a draft
// for the artisan to review (see conventions.md).
@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    private readonly fetcher: SafeFetcherService,
    private readonly extractor: ProductExtractionService,
  ) {}

  async importFromUrl(url: string): Promise<ImportedProductDraft> {
    try {
      const html = await this.fetcher.fetchHtml(url);
      return this.extractor.extract(html, url);
    } catch (error) {
      if (error instanceof ProductImportUnavailableError) {
        throw new BadRequestException(
          "Impossible d'importer les informations depuis cette URL. Vous pouvez remplir le formulaire manuellement.",
        );
      }
      this.logger.error(`Unexpected error importing product from URL: ${String(error)}`);
      throw new BadRequestException(
        "Impossible d'importer les informations depuis cette URL. Vous pouvez remplir le formulaire manuellement.",
      );
    }
  }
}

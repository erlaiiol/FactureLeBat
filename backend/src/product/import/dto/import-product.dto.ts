import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class ImportProductDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  url: string;

  // Fallback path for sites whose bot protection (DataDome, WAF...) blocks
  // SafeFetcherService's server-side fetch — the artisan's own browser isn't
  // blocked, so they can paste the page source they already have open
  // instead. When present, ProductImportService skips the network fetch
  // entirely and hands this straight to ProductExtractionService. Bounded at
  // the same 2MB SafeFetcherService caps a fetched response at, for the same
  // reason (readBounded).
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  html?: string;
}

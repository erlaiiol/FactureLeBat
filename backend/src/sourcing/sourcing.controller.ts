import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SearchSuppliersDto } from './dto/search-suppliers.dto';
import { SuggestComplementaryDto } from './dto/suggest-complementary.dto';
import { ComplementarySuggestion } from './entities/complementary-suggestion.entity';
import { SourcingSearchResult } from './entities/sourcing-search-result.entity';
import { SupplierCandidate } from './entities/supplier-candidate.entity';
import { SourcingService } from './sourcing.service';

@Controller('sourcing')
export class SourcingController {
  constructor(private readonly sourcingService: SourcingService) {}

  // Tighter than the global 100/min/IP default, same reasoning as
  // ProductController's import route: each call can trigger a real,
  // billable Groq request — the per-company daily cap (SourcingService) is
  // the primary cost guard, this is just a burst limiter on top.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('suppliers/search')
  searchSuppliers(
    @Body() dto: SearchSuppliersDto,
  ): Promise<SourcingSearchResult<SupplierCandidate>> {
    return this.sourcingService.searchSuppliers(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('complementary-suggestions')
  suggestComplementary(
    @Body() dto: SuggestComplementaryDto,
  ): Promise<SourcingSearchResult<ComplementarySuggestion>> {
    return this.sourcingService.suggestComplementary(dto);
  }
}

import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { CustomerModule } from '../customer/customer.module';
import { ProductModule } from '../product/product.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { DRAFT_RESOLVER } from './draft-resolver.interface';
import { InvoiceVoiceDraftController } from './invoice-voice-draft.controller';
import { InvoiceVoiceDraftRepository } from './invoice-voice-draft.repository';
import { InvoiceVoiceDraftService } from './invoice-voice-draft.service';
import { AnthropicLlmClientService } from './llm/anthropic-llm-client.service';
import { LLM_CLIENT } from './llm/llm-client.interface';
import { LlmDraftResolverService } from './llm/llm-draft-resolver.service';
import { RuleBasedDraftResolverService } from './rule-based/rule-based-draft-resolver.service';

@Module({
  // CompanyModule for Company.defaultDepositPercentageBasisPoints
  // (CompanyRepository, exported directly — see its own module comment);
  // Customer/Product/ServiceCatalogModule for their Service-layer
  // searchFuzzy/findByIdOrNull, reused rather than duplicated here.
  imports: [CompanyModule, CustomerModule, ProductModule, ServiceCatalogModule],
  controllers: [InvoiceVoiceDraftController],
  providers: [
    InvoiceVoiceDraftService,
    InvoiceVoiceDraftRepository,
    RuleBasedDraftResolverService,
    // LlmDraftResolverService/AnthropicLlmClientService stay fully
    // registered/injectable/tested but are NOT bound to DRAFT_RESOLVER —
    // "dormant" per the 2026-08-29 decision that an invoicing app
    // shouldn't require an LLM subscription just to exist. Re-enabling
    // the LLM engine (as a fallback, or a future Premium-tier upgrade) is
    // a one-line change to the `useClass` below, nothing else.
    LlmDraftResolverService,
    { provide: LLM_CLIENT, useClass: AnthropicLlmClientService },
    // The only line in this module that decides which engine actually
    // runs.
    { provide: DRAFT_RESOLVER, useClass: RuleBasedDraftResolverService },
  ],
})
export class InvoiceVoiceDraftModule {}

import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GroqClientService } from './groq/groq-client.service';
import { SourcingController } from './sourcing.controller';
import { SourcingRepository } from './sourcing.repository';
import { SourcingService } from './sourcing.service';

@Module({
  imports: [BillingModule],
  controllers: [SourcingController],
  providers: [SourcingService, SourcingRepository, GroqClientService],
})
export class SourcingModule {}

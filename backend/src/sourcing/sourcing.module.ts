import { Module } from '@nestjs/common';
import { GroqClientService } from './groq/groq-client.service';
import { SourcingController } from './sourcing.controller';
import { SourcingRepository } from './sourcing.repository';
import { SourcingService } from './sourcing.service';

@Module({
  controllers: [SourcingController],
  providers: [SourcingService, SourcingRepository, GroqClientService],
})
export class SourcingModule {}

import { Module } from '@nestjs/common';
import { SiteLegalController } from './site-legal.controller';
import { SiteLegalRepository } from './site-legal.repository';
import { SiteLegalService } from './site-legal.service';

@Module({
  controllers: [SiteLegalController],
  providers: [SiteLegalService, SiteLegalRepository],
  exports: [SiteLegalService],
})
export class SiteLegalModule {}

import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { SiteLegalModule } from '../site-legal/site-legal.module';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminSeedService } from './admin-seed.service';
import { AdminService } from './admin.service';

@Module({
  imports: [BillingModule, SiteLegalModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository, AdminSeedService],
})
export class AdminModule {}

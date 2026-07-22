import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './common/health.controller';
import { CompanyModule } from './company/company.module';
import { validateEnv } from './config/env.validation';
import { CustomerModule } from './customer/customer.module';
import { DatabaseModule } from './database/database.module';
import { InvoiceModule } from './invoice/invoice.module';
import { ProductModule } from './product/product.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global request budget: 100 requests / minute / IP. Generous enough for
    // normal use (a live total-preview does not hit the API), tight enough
    // to blunt scripted abuse against a single-artisan deployment with no
    // auth layer yet.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    CompanyModule,
    CustomerModule,
    InvoiceModule,
    ProductModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

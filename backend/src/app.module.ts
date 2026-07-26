import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CsrfGuard } from './auth/guards/csrf.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BillingModule } from './billing/billing.module';
import { HealthController } from './common/health.controller';
import { CompanyModule } from './company/company.module';
import { validateEnv } from './config/env.validation';
import { CustomerModule } from './customer/customer.module';
import { DatabaseModule } from './database/database.module';
import { InvoiceModule } from './invoice/invoice.module';
import { MailSettingsModule } from './mail-settings/mail-settings.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ProductModule } from './product/product.module';
import { ReportsModule } from './reports/reports.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';
import { SiteLegalModule } from './site-legal/site-legal.module';
import { SourcingModule } from './sourcing/sourcing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global request budget: 100 requests / minute / IP. Generous enough for
    // normal use (a live total-preview does not hit the API), tight enough
    // to blunt scripted abuse against the app.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    CompanyModule,
    CustomerModule,
    InvoiceModule,
    MailSettingsModule,
    OnboardingModule,
    ProductModule,
    ServiceCatalogModule,
    SiteLegalModule,
    SourcingModule,
    BillingModule,
    AdminModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: JwtAuthGuard must run before RolesGuard (which reads
    // req.user, populated by the former) — all three are registered here in
    // AppModule rather than scattered across feature modules specifically
    // to keep this order explicit and deterministic, since NestJS composes
    // every APP_GUARD provider into one ordered global chain (see Phase 13
    // roadmap notes). CsrfGuard doesn't need req.user but is authentication-
    // adjacent, so it's kept right after JwtAuthGuard.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

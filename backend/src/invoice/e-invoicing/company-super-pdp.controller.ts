import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CompanyService } from '../../company/company.service';
import { CompanySuperPdpService } from './company-super-pdp.service';

// Phase 1.2-4 (2026 e-invoicing reform): the artisan-facing side of
// connecting FactureLe to SUPER PDP — a per-company OAuth2 Authorization
// Code consent, not a single app-wide credential (SUPER PDP's own
// multi-tenant requirement, see super-pdp-client.service.ts). Lives next to
// the rest of the e-invoicing module rather than inside CompanyController
// itself, even though every route here is /company/super-pdp/* — keeps
// CompanyModule itself free of any SUPER-PDP-specific knowledge.
@Controller('company/super-pdp')
export class CompanySuperPdpController {
  private readonly frontendUrl: string;

  constructor(
    private readonly companySuperPdp: CompanySuperPdpService,
    private readonly companyService: CompanyService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:4200');
  }

  @Get('status')
  async status(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ configured: boolean; connected: boolean }> {
    const configured = this.companySuperPdp.isConfigured();
    const connected = configured ? await this.companySuperPdp.isConnected(user.companyId) : false;
    return { configured, connected };
  }

  // Redirects the artisan's browser straight to SUPER PDP's own consent
  // screen — same "302, nothing else to do here" shape as AuthController's
  // googleAuth.
  @Get('connect')
  async connect(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    if (!this.companySuperPdp.isConfigured()) {
      throw new ServiceUnavailableException(
        "La transmission via une plateforme agréée n'est pas configurée sur ce déploiement.",
      );
    }
    const profile = await this.companyService.getProfile(user.companyId);
    const url = this.companySuperPdp.buildConnectUrl({
      companyId: user.companyId,
      email: profile.email ?? user.email,
      siret: profile.siret,
    });
    res.redirect(url);
  }

  // SUPER PDP redirects back here after the artisan grants (or denies)
  // consent. Still authenticated: the browser never left this app's own
  // cookie jar, it only navigated out to SUPER PDP and back — same
  // assumption AuthController's googleCallback relies on for its own
  // redirect round-trip.
  @Get('callback')
  async callback(
    @CurrentUser() user: AuthenticatedUser,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // The frontend's actual route is /entreprise, not /mon-entreprise (the
    // nav label) — confirmed 2026-08-23 against app.routes.ts after this
    // redirect target was initially guessed wrong.
    const settingsUrl = `${this.frontendUrl}/entreprise`;
    if (!code || !state) {
      res.redirect(`${settingsUrl}?super_pdp=error`);
      return;
    }
    const stateCompanyId = this.companySuperPdp.verifyState(state);
    if (!stateCompanyId || stateCompanyId !== user.companyId) {
      // Expired/tampered state, or a state minted for a different session —
      // never trust the code in either case.
      res.redirect(`${settingsUrl}?super_pdp=error`);
      return;
    }
    try {
      await this.companySuperPdp.handleCallback(user.companyId, code);
      res.redirect(`${settingsUrl}?super_pdp=connected`);
    } catch {
      res.redirect(`${settingsUrl}?super_pdp=error`);
    }
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: AuthenticatedUser): Promise<{ connected: boolean }> {
    if (!this.companySuperPdp.isConfigured()) {
      throw new BadRequestException(
        "La transmission via une plateforme agréée n'est pas configurée sur ce déploiement.",
      );
    }
    await this.companySuperPdp.disconnect(user.companyId);
    return { connected: false };
  }
}

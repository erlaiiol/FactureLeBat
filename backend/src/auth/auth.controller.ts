import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AuthService, GoogleProfile } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './cookie.util';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { PublicUser } from './entities/public-user.entity';
import { GoogleOAuthEnabledGuard } from './guards/google-oauth-enabled.guard';

function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_TOKEN_COOKIE];
}

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;
  private readonly frontendUrl: string;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:4200');
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.register(dto);
    setAuthCookies(res, tokens, this.isProduction);
    return user;
  }

  // Tighter than the global 100/min/IP default: brute-force mitigation on
  // the one route that checks a password against a stored hash.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.login(dto);
    setAuthCookies(res, tokens, this.isProduction);
    return user;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.refresh(readRefreshCookie(req));
    setAuthCookies(res, tokens, this.isProduction);
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(readRefreshCookie(req));
    clearAuthCookies(res, this.isProduction);
  }

  // Returned shape mirrors PublicUser (minus newsletterOptIn, which isn't
  // carried in the JWT payload) so the frontend can treat every auth
  // endpoint's response uniformly — see AuthenticatedUser vs PublicUser.
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Omit<PublicUser, 'newsletterOptIn'> {
    return {
      id: user.userId,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      emailVerified: user.emailVerified,
    };
  }

  @Public()
  @UseGuards(GoogleOAuthEnabledGuard, AuthGuard('google'))
  @Get('google')
  googleAuth(): void {
    // AuthGuard('google') alone redirects to Google's consent screen and
    // never calls next() for this initial hop — nothing to do here.
  }

  @Public()
  @UseGuards(GoogleOAuthEnabledGuard, AuthGuard('google'))
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfile;
    const { tokens } = await this.authService.handleGoogleLogin(profile);
    setAuthCookies(res, tokens, this.isProduction);
    res.redirect(this.frontendUrl);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.requestPasswordReset(dto.email);
    // Always the same response regardless of whether the email exists — see
    // AuthService.requestPasswordReset.
    return {
      message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto);
    return { message: 'Mot de passe mis à jour.' };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    await this.authService.verifyEmail(dto.token);
    return { message: 'Email vérifié.' };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@CurrentUser() user: AuthenticatedUser): Promise<{ message: string }> {
    await this.authService.resendVerification(user.userId);
    return { message: 'Email de vérification renvoyé.' };
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.deleteAccount(user.userId, user.companyId, dto);
    clearAuthCookies(res, this.isProduction);
  }
}

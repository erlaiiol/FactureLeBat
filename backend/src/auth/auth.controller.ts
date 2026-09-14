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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import {
  APPLE_OAUTH_STATE_COOKIE,
  APPLE_OAUTH_STATE_TTL_MS,
  buildAppleAuthorizeUrl,
  generateAppleOAuthState,
} from './apple-web-oauth.util';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import { AuthService, GoogleProfile } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './cookie.util';
import { AppleTokenLoginDto } from './dto/apple-token-login.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { DemoLoginDto } from './dto/demo-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleTokenLoginDto } from './dto/google-token-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { PublicUser } from './entities/public-user.entity';
import { AppleOAuthEnabledGuard } from './guards/apple-oauth-enabled.guard';
import { AppleWebOAuthEnabledGuard } from './guards/apple-web-oauth-enabled.guard';
import { DemoModeEnabledGuard } from './guards/demo-mode-enabled.guard';
import { GoogleOAuthEnabledGuard } from './guards/google-oauth-enabled.guard';

function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_TOKEN_COOKIE];
}

function readAppleOAuthStateCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[APPLE_OAUTH_STATE_COOKIE];
}

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;
  private readonly frontendUrl: string;
  private readonly appleServicesId?: string;
  private readonly appleWebCallbackUrl: string;
  private readonly appleAndroidCallbackUrl: string;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:4200');
    this.appleServicesId = config.get<string>('APPLE_SERVICES_ID');
    this.appleWebCallbackUrl = config.get<string>(
      'APPLE_WEB_CALLBACK_URL',
      'http://localhost:3000/api/auth/apple/callback',
    );
    this.appleAndroidCallbackUrl = config.get<string>(
      'APPLE_ANDROID_CALLBACK_URL',
      'http://localhost:3000/api/auth/apple/mobile-callback',
    );
  }

  // Sets the short-lived state cookie shared by apple/apple-mobile-start
  // below — factored out since both authorize hops are otherwise identical
  // apart from which redirect_uri they send Apple.
  private startAppleAuthorize(res: Response, redirectUri: string): void {
    const state = generateAppleOAuthState();
    res.cookie(APPLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      maxAge: APPLE_OAUTH_STATE_TTL_MS,
      path: '/api/auth/apple',
    });
    res.redirect(buildAppleAuthorizeUrl({ clientId: this.appleServicesId!, redirectUri, state }));
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.register(dto);
    setAuthCookies(req, res, tokens, this.isProduction);
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.login(dto);
    setAuthCookies(req, res, tokens, this.isProduction);
    return user;
  }

  // Always callable, DEMO_MODE or not — returns [] when it's off (see
  // AuthService.getDemoProfiles), so the login page can decide whether to
  // render any quick-login buttons at all without ever showing one that
  // would 503 on click.
  @Public()
  @Get('demo-profiles')
  demoProfiles(): { key: string; label: string }[] {
    return this.authService.getDemoProfiles();
  }

  // Same brute-force-mitigation throttle as `login` above, even though there
  // is no password to guess here — this still creates a real session for
  // whoever calls it.
  @Public()
  @UseGuards(DemoModeEnabledGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('demo-login')
  @HttpCode(HttpStatus.OK)
  async demoLogin(
    @Body() dto: DemoLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.demoLogin(dto.key);
    setAuthCookies(req, res, tokens, this.isProduction);
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
    setAuthCookies(req, res, tokens, this.isProduction);
    return user;
  }

  // Public: logging out only needs the refresh cookie (read below), never
  // req.user — gating this behind the access-token guard would mean a
  // visitor whose 15-minute access token already expired can't log out at
  // all (their click would just 401 with no visible feedback, since this
  // path is deliberately exempt from the frontend's silent-refresh retry).
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(readRefreshCookie(req));
    clearAuthCookies(req, res, this.isProduction);
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
    setAuthCookies(req, res, tokens, this.isProduction);
    res.redirect(this.frontendUrl);
  }

  // Native mobile counterpart to googleAuth/googleCallback above — see
  // AuthService.googleTokenLogin for why this exists as a separate route
  // instead of reusing the browser-redirect flow.
  @Public()
  @UseGuards(GoogleOAuthEnabledGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google/token-login')
  @HttpCode(HttpStatus.OK)
  async googleTokenLogin(
    @Body() dto: GoogleTokenLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.googleTokenLogin(dto.idToken);
    setAuthCookies(req, res, tokens, this.isProduction);
    return user;
  }

  // Native-only counterpart to Google's token-login route above — no
  // browser-redirect equivalent exists for Apple here (see
  // AuthService.appleTokenLogin and docs/roadmap.md Phase 1.5).
  @Public()
  @UseGuards(AppleOAuthEnabledGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('apple/token-login')
  @HttpCode(HttpStatus.OK)
  async appleTokenLogin(
    @Body() dto: AppleTokenLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const { user, tokens } = await this.authService.appleTokenLogin(
      dto.identityToken,
      dto.authorizationCode,
      dto.platform,
    );
    setAuthCookies(req, res, tokens, this.isProduction);
    return user;
  }

  // Web browser-redirect counterpart to googleAuth/googleCallback above —
  // hand-rolled rather than a Passport strategy since Apple's Services ID
  // flow requires response_mode=form_post (a POST callback, not GET), which
  // AuthGuard('google')'s pattern doesn't fit. See apple-web-oauth.util.ts.
  @Public()
  @UseGuards(AppleWebOAuthEnabledGuard)
  @Get('apple')
  appleAuth(@Res() res: Response): void {
    this.startAppleAuthorize(res, this.appleWebCallbackUrl);
  }

  @Public()
  @UseGuards(AppleWebOAuthEnabledGuard)
  @Post('apple/callback')
  @HttpCode(HttpStatus.OK)
  async appleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const cookieState = readAppleOAuthStateCookie(req);
    res.clearCookie(APPLE_OAUTH_STATE_COOKIE, { path: '/api/auth/apple' });
    const body = req.body as { state?: string; id_token?: string };
    if (!cookieState || cookieState !== body.state || !body.id_token) {
      throw new UnauthorizedException('État OAuth Apple invalide.');
    }
    const { tokens } = await this.authService.appleWebLogin(body.id_token);
    setAuthCookies(req, res, tokens, this.isProduction);
    res.redirect(this.frontendUrl);
  }

  // Android counterpart to appleAuth above — Android has no native Sign in
  // with Apple SDK, so the app opens this in the system browser
  // (@capacitor/browser, never the app's own WebView) instead of calling a
  // native plugin. redirect_uri differs from the web flow so Apple's own
  // callback can tell the two apart.
  @Public()
  @UseGuards(AppleWebOAuthEnabledGuard)
  @Get('apple/mobile-start')
  appleMobileStart(@Res() res: Response): void {
    this.startAppleAuthorize(res, this.appleAndroidCallbackUrl);
  }

  // Bridges the system-browser flow back into the Android app: rather than
  // set cookies here (this response is loaded in Safari/Chrome, not the
  // app's own WebView — a session cookie set here would land in the wrong
  // cookie jar), this redirects to an HTTPS URL matched by the Android App
  // Link already declared for facturele.net, which the OS hands to the app
  // instead of a browser tab (see DeepLinkService's appUrlOpen listener).
  // The app then POSTs code/id_token to the existing native
  // apple/token-login route with platform: 'android' — no id_token
  // verification happens here, only there, so it isn't duplicated.
  @Public()
  @UseGuards(AppleWebOAuthEnabledGuard)
  @Post('apple/mobile-callback')
  @HttpCode(HttpStatus.OK)
  appleMobileCallback(@Req() req: Request, @Res() res: Response): void {
    const cookieState = readAppleOAuthStateCookie(req);
    res.clearCookie(APPLE_OAUTH_STATE_COOKIE, { path: '/api/auth/apple' });
    const body = req.body as { state?: string; code?: string; id_token?: string };
    if (!cookieState || cookieState !== body.state || !body.code || !body.id_token) {
      throw new UnauthorizedException('État OAuth Apple invalide.');
    }
    const bridgeUrl = new URL(`${this.frontendUrl}/auth/apple-mobile-return`);
    bridgeUrl.searchParams.set('code', body.code);
    bridgeUrl.searchParams.set('id_token', body.id_token);
    res.redirect(bridgeUrl.toString());
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.deleteAccount(user.userId, user.companyId, dto);
    clearAuthCookies(req, res, this.isProduction);
  }
}

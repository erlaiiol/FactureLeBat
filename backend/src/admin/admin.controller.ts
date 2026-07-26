import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';
import { PromoCodeModel } from '../../generated/prisma/models';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePromoCodeDto } from '../billing/dto/create-promo-code.dto';
import { PromoCodeService } from '../billing/promo-code/promo-code.service';
import { SiteLegalService } from '../site-legal/site-legal.service';
import { UpdateSiteLegalInfoDto } from '../site-legal/dto/update-site-legal-info.dto';
import { SiteLegalInfo } from '../site-legal/entities/site-legal-info.entity';
import { AdminService } from './admin.service';
import { GrantPremiumDto } from './dto/grant-premium.dto';
import { SetPromoCodeActiveDto } from './dto/set-promo-code-active.dto';
import { AdminUserList } from './entities/admin-user-summary.entity';

// @Roles(ADMIN) at class level covers every route below — RolesGuard is
// global (see app.module.ts) and already runs after JwtAuthGuard, so a
// non-admin (or anonymous) request never reaches these handlers at all,
// not even to get a "you're not allowed" response body with any real data
// in it.
@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly promoCodeService: PromoCodeService,
    private readonly siteLegalService: SiteLegalService,
  ) {}

  @Get('users')
  listUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
  ): Promise<AdminUserList> {
    return this.adminService.listUsers(search, page ? Number(page) : 1);
  }

  @Post('users/:companyId/grant-premium')
  async grantPremium(
    @Param('companyId') companyId: string,
    @Body() dto: GrantPremiumDto,
  ): Promise<{ premiumGrantedUntil: Date }> {
    const premiumGrantedUntil = await this.adminService.grantPremiumDays(companyId, dto.days);
    return { premiumGrantedUntil };
  }

  @Get('promo-codes')
  listPromoCodes(): Promise<PromoCodeModel[]> {
    return this.promoCodeService.listAll();
  }

  @Post('promo-codes')
  createPromoCode(@Body() dto: CreatePromoCodeDto): Promise<PromoCodeModel> {
    return this.promoCodeService.create(dto);
  }

  @Patch('promo-codes/:id')
  async setPromoCodeActive(
    @Param('id') id: string,
    @Body() dto: SetPromoCodeActiveDto,
  ): Promise<{ id: string; active: boolean }> {
    await this.promoCodeService.setActive(id, dto.active);
    return { id, active: dto.active };
  }

  @Delete('promo-codes/:id')
  async deletePromoCode(@Param('id') id: string): Promise<{ id: string }> {
    await this.promoCodeService.delete(id);
    return { id };
  }

  // Read side deliberately lives at the public GET /site-legal (mentions
  // légales are, by law, public data) — the admin "Infos légales" form
  // reads from there too instead of a duplicate GET here. Only the write
  // side needs the admin role.
  @Patch('site-legal')
  updateSiteLegalInfo(@Body() dto: UpdateSiteLegalInfoDto): Promise<SiteLegalInfo> {
    return this.siteLegalService.updateInfo(dto);
  }
}

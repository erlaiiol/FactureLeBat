import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CatalogFolderService } from './catalog-folder.service';
import { CreateCatalogFolderDto } from './dto/create-catalog-folder.dto';
import { UpdateCatalogFolderDto } from './dto/update-catalog-folder.dto';
import { CatalogFolderProfile } from './entities/catalog-folder.entity';

@Controller('catalog-folders')
export class CatalogFolderController {
  constructor(private readonly catalogFolderService: CatalogFolderService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
  ): Promise<CatalogFolderProfile[]> {
    return this.catalogFolderService.findAll(user.companyId, search);
  }

  @Get(':id')
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CatalogFolderProfile> {
    return this.catalogFolderService.findById(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCatalogFolderDto,
  ): Promise<CatalogFolderProfile> {
    return this.catalogFolderService.create(user.companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogFolderDto,
  ): Promise<CatalogFolderProfile> {
    return this.catalogFolderService.update(user.companyId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.catalogFolderService.delete(user.companyId, id);
  }
}

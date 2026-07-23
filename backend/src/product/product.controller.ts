import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductProfile } from './entities/product.entity';
import { ImportProductDto } from './import/dto/import-product.dto';
import { ImportedProductDraft } from './import/entities/imported-product.entity';
import { ProductImportService } from './import/product-import.service';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly productImportService: ProductImportService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
  ): Promise<ProductProfile[]> {
    return this.productService.findAll(user.companyId, search);
  }

  // Tighter than the global 100/min/IP default: this route makes an
  // outbound HTTP request per call, which is materially more expensive and
  // more abusable (as an SSRF probe or a proxy) than ordinary CRUD. Not
  // tenant-scoped — this never touches Prisma, see ProductImportService.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('import')
  importFromUrl(@Body() dto: ImportProductDto): Promise<ImportedProductDraft> {
    return this.productImportService.importFromUrl(dto.url);
  }

  @Get(':id')
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ProductProfile> {
    return this.productService.findById(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ProductProfile> {
    return this.productService.create(user.companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductProfile> {
    return this.productService.update(user.companyId, id, dto);
  }
}

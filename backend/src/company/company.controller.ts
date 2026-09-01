import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Post,
  Res,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import {
  ALLOWED_RASTER_IMAGE_MIME_TYPES,
  matchesDeclaredImageType,
} from '../common/raster-image-upload.util';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateQuantityInputModeDto } from './dto/update-quantity-input-mode.dto';
import { CompanyProfile } from './entities/company.entity';

// A generous bound for a logo image, not a real limit — keeps a single
// upload (base64-embedded into every generated PDF, see InvoiceMapper.
// issuerFields) from bloating every invoice PDF this company ever generates.
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<CompanyProfile> {
    return this.companyService.getProfile(user.companyId);
  }

  @Patch()
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
  ): Promise<CompanyProfile> {
    return this.companyService.updateProfile(user.companyId, dto);
  }

  @Patch('quantity-input-mode')
  updateQuantityInputMode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateQuantityInputModeDto,
  ): Promise<CompanyProfile> {
    return this.companyService.updateQuantityInputMode(
      user.companyId,
      dto.preferKeyboardQuantityInput,
    );
  }

  // The artisan's own logo — shown top-right on every invoice/devis PDF
  // (PdfService.buildHeader) once uploaded. Stored in its own table (see
  // schema.prisma's comment on Company.logo), never on the Company row.
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LOGO_SIZE_BYTES },
    }),
  )
  async uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<CompanyProfile> {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }
    if (!ALLOWED_RASTER_IMAGE_MIME_TYPES[file.mimetype]) {
      throw new UnsupportedMediaTypeException('Le logo doit être une image PNG ou JPEG.');
    }
    if (!matchesDeclaredImageType(file.buffer, file.mimetype)) {
      throw new UnsupportedMediaTypeException("Ce fichier n'est pas une image PNG ou JPEG valide.");
    }
    return this.companyService.uploadLogo(user.companyId, {
      image: file.buffer,
      mimeType: file.mimetype,
    });
  }

  @Delete('logo')
  removeLogo(@CurrentUser() user: AuthenticatedUser): Promise<CompanyProfile> {
    return this.companyService.removeLogo(user.companyId);
  }

  // Streams the raw image bytes with the right Content-Type — plain <img
  // src="/api/company/logo"> from the frontend, same cookie-auth reliance as
  // the existing PDF download links (GET /invoices/:id/pdf).
  @Get('logo')
  async serveLogo(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const logo = await this.companyService.getLogo(user.companyId);
    if (!logo) {
      throw new NotFoundException('Aucun logo configuré.');
    }
    res.setHeader('Content-Type', logo.mimeType);
    // Never cached across companies/logo changes without revalidation —
    // the frontend busts this with a cache-buster query param instead (see
    // CompanyService.logoUrl) rather than relying on HTTP caching semantics
    // here.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(logo.image);
  }
}

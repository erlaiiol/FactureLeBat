import { Injectable } from '@nestjs/common';
import { CompanyLogoData, CompanyRepository } from './company.repository';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyProfile } from './entities/company.entity';

@Injectable()
export class CompanyService {
  constructor(private readonly companyRepository: CompanyRepository) {}

  async getProfile(companyId: string): Promise<CompanyProfile> {
    const [company, hasLogo] = await Promise.all([
      this.companyRepository.findById(companyId),
      this.companyRepository.hasLogo(companyId),
    ]);
    return { ...company, hasLogo };
  }

  async updateProfile(companyId: string, dto: UpdateCompanyDto): Promise<CompanyProfile> {
    const sanitizedDto = await this.sanitizeWorkflowPreferences(companyId, dto);
    const [company, hasLogo] = await Promise.all([
      this.companyRepository.update(companyId, sanitizedDto),
      this.companyRepository.hasLogo(companyId),
    ]);
    return { ...company, hasLogo };
  }

  // Phase 1.3-1 (2026 e-invoicing reform, workflow automation):
  // autoTransmitViaPa/autoSyncReceivedInvoices only make sense once SUPER
  // PDP is connected — the settings UI already disables these toggles until
  // then (see docs/1.3/1.3-1-workflow-preferences.md), this is the
  // server-side backstop so a stale or forged request can't turn either on
  // regardless. Silently coerces rather than rejecting the whole request:
  // every other field in the same PATCH is still perfectly valid to save.
  private async sanitizeWorkflowPreferences(
    companyId: string,
    dto: UpdateCompanyDto,
  ): Promise<UpdateCompanyDto> {
    if (!dto.autoTransmitViaPa && !dto.autoSyncReceivedInvoices) {
      return dto;
    }
    const connected = await this.companyRepository.isSuperPdpConnected(companyId);
    if (connected) {
      return dto;
    }
    return { ...dto, autoTransmitViaPa: false, autoSyncReceivedInvoices: false };
  }

  // Persists QuantityWheelPickerComponent's own Clavier/Molette toggle, or
  // the equivalent checkbox in "Mon entreprise" — same column either way,
  // see schema.prisma's comment on Company.preferKeyboardQuantityInput.
  async updateQuantityInputMode(
    companyId: string,
    preferKeyboardQuantityInput: boolean,
  ): Promise<CompanyProfile> {
    await this.companyRepository.updatePreferKeyboardQuantityInput(
      companyId,
      preferKeyboardQuantityInput,
    );
    return this.getProfile(companyId);
  }

  // Phase: top-right invoice logo. Only PdfService's PDF-building path and
  // GET /company/logo need the actual bytes — see CompanyRepository.findLogo's
  // comment for why this is never folded into getProfile above.
  getLogo(companyId: string): Promise<CompanyLogoData | null> {
    return this.companyRepository.findLogo(companyId);
  }

  async uploadLogo(companyId: string, data: CompanyLogoData): Promise<CompanyProfile> {
    await this.companyRepository.upsertLogo(companyId, data);
    return this.getProfile(companyId);
  }

  async removeLogo(companyId: string): Promise<CompanyProfile> {
    await this.companyRepository.deleteLogo(companyId);
    return this.getProfile(companyId);
  }
}

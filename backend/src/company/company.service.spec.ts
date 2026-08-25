import { CompanyRepository } from './company.repository';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

function buildDto(overrides: Partial<UpdateCompanyDto> = {}): UpdateCompanyDto {
  return {
    name: 'Bâti Rénov',
    siret: '12345678901234',
    addressLine1: '1 rue des Artisans',
    postalCode: '75000',
    city: 'Paris',
    legalStatus: 'MICRO_ENTREPRENEUR',
    vatRateBasisPoints: 2000,
    cotisationVenteBasisPoints: 1230,
    cotisationPrestationBicBasisPoints: 2120,
    cotisationPrestationBncBasisPoints: 2110,
    decennialInsuranceApplicable: false,
    customFooterOnFacture: false,
    customFooterOnDevis: false,
    vatOnDebitsOption: false,
    autoAttachFacturX: false,
    autoTransmitViaPa: false,
    autoSyncReceivedInvoices: false,
    ...overrides,
  };
}

function buildService(isSuperPdpConnected: boolean) {
  const update = jest
    .fn()
    .mockImplementation((_companyId: string, dto: UpdateCompanyDto) =>
      Promise.resolve({ id: 'company-1', ...dto }),
    );
  const hasLogo = jest.fn().mockResolvedValue(false);
  const isSuperPdpConnectedFn = jest.fn().mockResolvedValue(isSuperPdpConnected);
  const companyRepository = {
    update,
    hasLogo,
    isSuperPdpConnected: isSuperPdpConnectedFn,
  } as unknown as CompanyRepository;

  const service = new CompanyService(companyRepository);
  return { service, update, isSuperPdpConnectedFn };
}

describe('CompanyService.updateProfile', () => {
  it('passes autoTransmitViaPa/autoSyncReceivedInvoices through unchanged when SUPER PDP is connected', async () => {
    const { service, update, isSuperPdpConnectedFn } = buildService(true);
    const dto = buildDto({ autoTransmitViaPa: true, autoSyncReceivedInvoices: true });

    await service.updateProfile('company-1', dto);

    expect(isSuperPdpConnectedFn).toHaveBeenCalledWith('company-1');
    expect(update).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ autoTransmitViaPa: true, autoSyncReceivedInvoices: true }),
    );
  });

  it('silently coerces autoTransmitViaPa/autoSyncReceivedInvoices to false when SUPER PDP is not connected', async () => {
    const { service, update } = buildService(false);
    const dto = buildDto({ autoTransmitViaPa: true, autoSyncReceivedInvoices: true });

    await service.updateProfile('company-1', dto);

    expect(update).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ autoTransmitViaPa: false, autoSyncReceivedInvoices: false }),
    );
  });

  it('never checks the connection when both toggles are already false', async () => {
    const { service, update, isSuperPdpConnectedFn } = buildService(false);
    const dto = buildDto();

    await service.updateProfile('company-1', dto);

    expect(isSuperPdpConnectedFn).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ autoTransmitViaPa: false, autoSyncReceivedInvoices: false }),
    );
  });

  it('does not clear autoAttachFacturX when SUPER PDP is disconnected — it has no PA dependency', async () => {
    const { service, update } = buildService(false);
    const dto = buildDto({ autoAttachFacturX: true });

    await service.updateProfile('company-1', dto);

    expect(update).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ autoAttachFacturX: true }),
    );
  });
});

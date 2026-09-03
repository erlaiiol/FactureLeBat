import { CompanyRepository } from '../../company/company.repository';
import { CompanySuperPdpService } from './company-super-pdp.service';
import { SuperPdpProvisioningCronService } from './super-pdp-provisioning-cron.service';

function buildService(options: { configured?: boolean } = {}) {
  const findCompaniesPendingSuperPdpProvisioning = jest.fn().mockResolvedValue([]);
  const companyRepository = {
    findCompaniesPendingSuperPdpProvisioning,
  } as unknown as CompanyRepository;

  const isConfigured = jest.fn().mockReturnValue(options.configured ?? true);
  const provisionCompany = jest.fn().mockResolvedValue('provisioned');
  const companySuperPdp = { isConfigured, provisionCompany } as unknown as CompanySuperPdpService;

  const service = new SuperPdpProvisioningCronService(companyRepository, companySuperPdp);
  return { service, findCompaniesPendingSuperPdpProvisioning, provisionCompany, isConfigured };
}

describe('SuperPdpProvisioningCronService.sweep', () => {
  it('provisions every company returned by findCompaniesPendingSuperPdpProvisioning', async () => {
    const { service, findCompaniesPendingSuperPdpProvisioning, provisionCompany } = buildService();
    const companyA = { id: 'company-1', siret: '1', legalStatus: 'COMPANY' } as never;
    const companyB = { id: 'company-2', siret: '2', legalStatus: 'COMPANY' } as never;
    findCompaniesPendingSuperPdpProvisioning.mockResolvedValue([companyA, companyB]);

    await service.sweep();

    expect(provisionCompany).toHaveBeenCalledWith(companyA);
    expect(provisionCompany).toHaveBeenCalledWith(companyB);
    expect(provisionCompany).toHaveBeenCalledTimes(2);
  });

  it('logs and continues past a failure on one company, still provisioning the rest of the run', async () => {
    const { service, findCompaniesPendingSuperPdpProvisioning, provisionCompany } = buildService();
    findCompaniesPendingSuperPdpProvisioning.mockResolvedValue([
      { id: 'company-1' },
      { id: 'company-2' },
    ]);
    provisionCompany
      .mockRejectedValueOnce(new Error('SUPER PDP unreachable'))
      .mockResolvedValueOnce('provisioned');

    await expect(service.sweep()).resolves.toBeUndefined();

    expect(provisionCompany).toHaveBeenCalledTimes(2);
  });

  it('does nothing when SUPER PDP is not configured on this deployment', async () => {
    const { service, findCompaniesPendingSuperPdpProvisioning, isConfigured } = buildService({
      configured: false,
    });

    await service.sweep();

    expect(isConfigured).toHaveBeenCalled();
    expect(findCompaniesPendingSuperPdpProvisioning).not.toHaveBeenCalled();
  });
});

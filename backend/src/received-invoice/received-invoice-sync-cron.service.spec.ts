import { CompanyRepository } from '../company/company.repository';
import { ReceivedInvoiceSyncCronService } from './received-invoice-sync-cron.service';
import { ReceivedInvoiceService } from './received-invoice.service';

function buildService() {
  const findCompaniesForAutoSync = jest.fn().mockResolvedValue([]);
  const companyRepository = { findCompaniesForAutoSync } as unknown as CompanyRepository;

  const sync = jest.fn().mockResolvedValue([]);
  const receivedInvoiceService = { sync } as unknown as ReceivedInvoiceService;

  const service = new ReceivedInvoiceSyncCronService(companyRepository, receivedInvoiceService);
  return { service, findCompaniesForAutoSync, sync };
}

describe('ReceivedInvoiceSyncCronService.sweep', () => {
  it('syncs every company returned by findCompaniesForAutoSync (already filtered to opted-in + connected)', async () => {
    const { service, findCompaniesForAutoSync, sync } = buildService();
    findCompaniesForAutoSync.mockResolvedValue([{ id: 'company-1' }, { id: 'company-2' }]);

    await service.sweep();

    expect(sync).toHaveBeenCalledWith('company-1');
    expect(sync).toHaveBeenCalledWith('company-2');
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('logs and continues past a failure on one company, still syncing the rest of the run', async () => {
    const { service, findCompaniesForAutoSync, sync } = buildService();
    findCompaniesForAutoSync.mockResolvedValue([{ id: 'company-1' }, { id: 'company-2' }]);
    sync.mockRejectedValueOnce(new Error('SUPER PDP unreachable')).mockResolvedValueOnce([]);

    await expect(service.sweep()).resolves.toBeUndefined();

    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no company is eligible', async () => {
    const { service, sync } = buildService();

    await service.sweep();

    expect(sync).not.toHaveBeenCalled();
  });
});

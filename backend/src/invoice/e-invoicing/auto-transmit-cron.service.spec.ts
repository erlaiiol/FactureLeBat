import { InvoiceRepository } from '../invoice.repository';
import { AutoTransmitCronService } from './auto-transmit-cron.service';
import { EInvoiceTransmissionService } from './e-invoice-transmission.service';

function buildService() {
  const findDueForAutoTransmit = jest.fn().mockResolvedValue([]);
  const claimAutoTransmit = jest.fn().mockResolvedValue(true);
  const invoiceRepository = {
    findDueForAutoTransmit,
    claimAutoTransmit,
  } as unknown as InvoiceRepository;

  const transmit = jest.fn().mockResolvedValue(undefined);
  const transmissionService = { transmit } as unknown as EInvoiceTransmissionService;

  const service = new AutoTransmitCronService(invoiceRepository, transmissionService);
  return { service, findDueForAutoTransmit, claimAutoTransmit, transmit };
}

describe('AutoTransmitCronService.sweep', () => {
  it('transmits every due invoice it successfully claims', async () => {
    const { service, findDueForAutoTransmit, transmit } = buildService();
    findDueForAutoTransmit.mockResolvedValue([
      { id: 'inv-1', companyId: 'company-1' },
      { id: 'inv-2', companyId: 'company-2' },
    ]);

    await service.sweep();

    expect(transmit).toHaveBeenCalledWith('company-1', 'inv-1');
    expect(transmit).toHaveBeenCalledWith('company-2', 'inv-2');
    expect(transmit).toHaveBeenCalledTimes(2);
  });

  it('skips an invoice it fails to claim (already claimed by another tick or a manual click) without calling transmit', async () => {
    const { service, findDueForAutoTransmit, claimAutoTransmit, transmit } = buildService();
    findDueForAutoTransmit.mockResolvedValue([{ id: 'inv-1', companyId: 'company-1' }]);
    claimAutoTransmit.mockResolvedValue(false);

    await service.sweep();

    expect(transmit).not.toHaveBeenCalled();
  });

  it('logs and continues past a failure on one invoice, still processing the rest of the run', async () => {
    const { service, findDueForAutoTransmit, transmit } = buildService();
    findDueForAutoTransmit.mockResolvedValue([
      { id: 'inv-1', companyId: 'company-1' },
      { id: 'inv-2', companyId: 'company-2' },
    ]);
    transmit
      .mockRejectedValueOnce(new Error('SUPER PDP unreachable'))
      .mockResolvedValueOnce(undefined);

    await expect(service.sweep()).resolves.toBeUndefined();

    expect(transmit).toHaveBeenCalledTimes(2);
  });

  it('does nothing when nothing is due', async () => {
    const { service, transmit } = buildService();

    await service.sweep();

    expect(transmit).not.toHaveBeenCalled();
  });
});

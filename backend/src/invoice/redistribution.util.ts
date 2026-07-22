import { ServiceVisibility } from '../../generated/prisma/enums';
import { CreateInvoiceServiceLineDto } from './dto/create-invoice-service-line.dto';
import { RedistributionStrategy } from './dto/redistribution-strategy.enum';

// EQUAL is expanded here into an explicit weight of 1 per line — from this
// point on, every caller only ever deals with one concept, a weighted split
// (see InvoiceCalculationService.computeWeightedSplit). Shared by
// InvoiceService.create() (persisted path) and InvoiceMapper.toPreviewPdfData
// (draft path, Phase 6) so the two can never compute a different split for
// the same input.
export function expandServiceLineWeights(
  serviceLine: CreateInvoiceServiceLineDto,
  lineCount: number,
): number[] | undefined {
  if (serviceLine.visibility !== ServiceVisibility.REDISTRIBUTED) {
    return undefined;
  }
  return serviceLine.redistributionStrategy === RedistributionStrategy.EQUAL
    ? Array.from({ length: lineCount }, () => 1)
    : serviceLine.weights!;
}

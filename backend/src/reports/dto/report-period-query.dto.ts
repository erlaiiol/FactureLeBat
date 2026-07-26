import { IsISO8601 } from 'class-validator';

// The report screen always computes its own period bounds (quarter, month,
// or a custom range) and sends them explicitly — no period-math (quarter
// boundaries, declarationFrequency interpretation) is duplicated
// backend-side, same "no business-logic duplication" convention as every
// other computed figure in this app.
export class ReportPeriodQueryDto {
  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;
}

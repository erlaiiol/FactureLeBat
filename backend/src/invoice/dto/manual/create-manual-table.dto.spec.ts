import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateManualTableDto } from './create-manual-table.dto';

const REQUIRED_COLUMNS = [
  { role: 'DESCRIPTION', label: 'Désignation' },
  { role: 'QUANTITY', label: 'Quantité' },
  { role: 'UNIT_PRICE', label: 'Prix unitaire' },
  { role: 'LINE_TOTAL', label: 'Total' },
];

function tablePayload(overrides: Record<string, unknown> = {}) {
  return {
    columns: REQUIRED_COLUMNS,
    rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00'] }],
    ...overrides,
  };
}

async function validateTable(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateManualTableDto, payload);
  return validate(dto);
}

describe('CreateManualTableDto — Phase 9.5 manual invoice mode', () => {
  it('accepts a well-formed table with just the four required columns', async () => {
    const errors = await validateTable(tablePayload());
    expect(errors).toHaveLength(0);
  });

  it('accepts a CUSTOM column alongside the four required ones', async () => {
    const errors = await validateTable(
      tablePayload({
        columns: [...REQUIRED_COLUMNS, { role: 'CUSTOM', label: 'Référence chantier' }],
        rows: [{ cells: ['Parquet chêne massif', '10', '45.00', '450.00', 'Chantier Dupont'] }],
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a table missing the QUANTITY column', async () => {
    const errors = await validateTable(
      tablePayload({
        columns: REQUIRED_COLUMNS.filter((column) => column.role !== 'QUANTITY'),
        rows: [{ cells: ['Parquet chêne massif', '45.00', '450.00'] }],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a table missing the LINE_TOTAL column', async () => {
    const errors = await validateTable(
      tablePayload({
        columns: REQUIRED_COLUMNS.filter((column) => column.role !== 'LINE_TOTAL'),
        rows: [{ cells: ['Parquet chêne massif', '10', '45.00'] }],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a table with two DESCRIPTION columns', async () => {
    const errors = await validateTable(
      tablePayload({
        columns: [...REQUIRED_COLUMNS, { role: 'DESCRIPTION', label: 'Autre description' }],
        rows: [{ cells: ['Parquet', '10', '45.00', '450.00', 'Autre'] }],
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a row whose cell count does not match the column count', async () => {
    const errors = await validateTable(tablePayload({ rows: [{ cells: ['Parquet', '10'] }] }));
    expect(errors).not.toHaveLength(0);
  });

  it('rejects a row with an empty description cell', async () => {
    const errors = await validateTable(
      tablePayload({ rows: [{ cells: ['', '10', '45.00', '450.00'] }] }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts free text in the quantity cell — it is purely informational, not fed into the total', async () => {
    const errors = await validateTable(
      tablePayload({ rows: [{ cells: ['Parquet', '2 boites', '45.00', '450.00'] }] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a row whose LINE_TOTAL cell is neither blank nor a number', async () => {
    const errors = await validateTable(
      tablePayload({ rows: [{ cells: ['Parquet', '10', '45.00', 'beaucoup'] }] }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts a blank LINE_TOTAL cell — the artisan fills it in at their own pace', async () => {
    const errors = await validateTable(
      tablePayload({ rows: [{ cells: ['Parquet', '10', '45.00', ''] }] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts a comma decimal separator in a unit price/line total cell', async () => {
    const errors = await validateTable(
      tablePayload({ rows: [{ cells: ['Parquet', '10,5', '45,90', '482,45'] }] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative unit price cell', async () => {
    const errors = await validateTable(
      tablePayload({ rows: [{ cells: ['Parquet', '10', '-45.00', '450.00'] }] }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('accepts free text in a CUSTOM cell, including text that would look like markup', async () => {
    const errors = await validateTable(
      tablePayload({
        columns: [...REQUIRED_COLUMNS, { role: 'CUSTOM', label: 'Note' }],
        rows: [{ cells: ['Parquet', '10', '45.00', '450.00', '<b>promo</b> -10%'] }],
      }),
    );
    expect(errors).toHaveLength(0);
  });
});

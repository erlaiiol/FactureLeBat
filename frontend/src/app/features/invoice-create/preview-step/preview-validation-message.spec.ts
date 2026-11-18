import { HttpErrorResponse } from '@angular/common/http';
import { previewValidationMessage } from './preview-validation-message.util';

function badRequest(message: string | string[]): HttpErrorResponse {
  return new HttpErrorResponse({ status: 400, error: { statusCode: 400, message } });
}

describe('previewValidationMessage', () => {
  it('names the too-long service line, 1-based', () => {
    expect(
      previewValidationMessage(
        badRequest(['serviceLines.1.name must be shorter than or equal to 200 characters']),
      ),
    ).toBe(
      'Le nom de la prestation 2 est trop long (200 caractères max). Raccourcissez-le pour voir l’aperçu.',
    );
  });

  it('uses the feminine form for a product line description', () => {
    expect(
      previewValidationMessage(
        badRequest('lines.0.description must be shorter than or equal to 300 characters'),
      ),
    ).toContain('La description de la ligne 1 est trop longue');
  });

  it('falls back to a generic sentence for anything else', () => {
    expect(previewValidationMessage(badRequest('entryMode GUIDED requires …'))).toBe(
      'Certaines lignes de la facture sont invalides — vérifiez-les avant de voir l’aperçu.',
    );
  });
});

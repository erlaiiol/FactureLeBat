import { HttpErrorResponse } from '@angular/common/http';

// Turns the backend's class-validator message (English, technical) into one
// French sentence. Only the cases the lines step can't already catch
// client-side need a dedicated wording; anything else gets a generic one.
export function previewValidationMessage(error: HttpErrorResponse): string {
  const raw: unknown = error.error?.message;
  const message = Array.isArray(raw) ? raw.join(' ; ') : String(raw ?? '');
  const tooLong =
    /(serviceLines|discountLines|lines)\.(\d+)\.(name|description)[^;]*shorter than or equal to (\d+)/.exec(
      message,
    );
  if (tooLong) {
    const [, collection, index, , max] = tooLong;
    const label =
      collection === 'serviceLines'
        ? 'Le nom de la prestation'
        : collection === 'discountLines'
          ? 'Le nom de la remise'
          : 'La description de la ligne';
    const feminine = collection === 'lines';
    return `${label} ${Number(index) + 1} est trop ${feminine ? 'longue' : 'long'} (${max} caractères max). Raccourcissez-${feminine ? 'la' : 'le'} pour voir l’aperçu.`;
  }
  return 'Certaines lignes de la facture sont invalides — vérifiez-les avant de voir l’aperçu.';
}

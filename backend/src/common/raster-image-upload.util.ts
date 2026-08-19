// Shared by every endpoint that accepts an artisan-uploaded raster image
// composited into a PDF (CompanyController.uploadLogo, InvoiceController's
// signature upload) — pdfMake (see PdfService) can only embed PNG/JPEG, and
// the browser-supplied mimetype is trivially spoofable, so every such
// endpoint validates both the declared mimetype and the file's actual
// leading bytes before accepting it.
export const ALLOWED_RASTER_IMAGE_MIME_TYPES: Record<string, true> = {
  'image/png': true,
  'image/jpeg': true,
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

export function matchesDeclaredImageType(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'image/png') {
    return buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  }
  if (mimetype === 'image/jpeg') {
    return buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE);
  }
  return false;
}

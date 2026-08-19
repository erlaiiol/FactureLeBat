import { IsEnum } from 'class-validator';
import { SignatureMethod } from '../../../generated/prisma/enums';

// Multipart form field alongside the uploaded file — see
// InvoiceController.uploadSignature.
export class UploadInvoiceSignatureDto {
  @IsEnum(SignatureMethod)
  method: SignatureMethod;
}

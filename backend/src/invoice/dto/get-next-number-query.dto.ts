import { IsEnum } from 'class-validator';
import { DocumentType } from '../../../generated/prisma/enums';

export class GetNextNumberQueryDto {
  @IsEnum(DocumentType)
  documentType: DocumentType;
}

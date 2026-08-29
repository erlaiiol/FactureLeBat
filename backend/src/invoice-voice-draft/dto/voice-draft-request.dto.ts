import { IsString, MaxLength, MinLength } from 'class-validator';

// Generous upper bound on a dictated/typed invoice description — long
// enough for a real multi-line dictation, short enough to reject an
// obviously-wrong paste/mistake before it ever reaches the LLM call (see
// CreateInvoiceDto's own MAX_* constants for the same "generous but
// finite" posture).
const MAX_TRANSCRIPT_LENGTH = 2000;

export class VoiceDraftRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TRANSCRIPT_LENGTH)
  transcript: string;
}

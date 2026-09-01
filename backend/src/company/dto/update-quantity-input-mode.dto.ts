import { IsBoolean } from 'class-validator';

// Deliberately separate from UpdateCompanyDto (the big profile form) — same
// "own lightweight endpoint" reasoning as OnboardingService.setTourEnabled:
// QuantityWheelPickerComponent persists this the instant the artisan slides
// the Clavier/Molette toggle, without resending every other required
// company field a full profile save carries.
export class UpdateQuantityInputModeDto {
  @IsBoolean()
  preferKeyboardQuantityInput: boolean;
}

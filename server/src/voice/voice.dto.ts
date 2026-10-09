import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class InterpretVoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  transcript: string;
}

export const EXECUTABLE_ACTIONS = [
  "report_delay",
  "confirm_pickup",
  "confirm_delivery",
  "set_pickup_location",
  "set_delivery_location",
] as const;

/** A proposed action the driver confirmed (they may have edited the minutes or address). */
export class ExecuteVoiceDto {
  @IsIn(EXECUTABLE_ACTIONS)
  action: (typeof EXECUTABLE_ACTIONS)[number];

  @IsUUID()
  cargoId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  delayMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
}

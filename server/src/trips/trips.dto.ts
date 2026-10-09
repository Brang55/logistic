import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ReportDelayDto {
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  minutes: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

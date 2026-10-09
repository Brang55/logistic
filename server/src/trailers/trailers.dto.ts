import { PartialType } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTrailerDto {
  @IsString()
  @IsNotEmpty()
  trailerNumber: string;

  @IsOptional()
  @IsString()
  trailer?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateTrailerDto extends PartialType(CreateTrailerDto) {}

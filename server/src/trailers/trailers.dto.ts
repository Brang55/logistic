import { PartialType } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { RESOURCE_STATUSES, ResourceStatus } from "../common/assignable";

export class CreateTrailerDto {
  @IsString()
  @IsNotEmpty()
  trailerNumber: string;

  @IsOptional()
  @IsString()
  trailer?: string;

  @IsOptional()
  @IsIn(RESOURCE_STATUSES)
  status?: ResourceStatus;
}

export class UpdateTrailerDto extends PartialType(CreateTrailerDto) {}

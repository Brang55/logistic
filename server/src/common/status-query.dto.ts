import { IsOptional, IsString } from "class-validator";

export class StatusQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

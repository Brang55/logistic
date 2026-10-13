import { IsString, MaxLength } from "class-validator";

export class GateDto {
  @IsString()
  @MaxLength(200)
  password: string;
}

import { PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  truckDriverEmail: string;

  // The existing web form may send the phone number as a number.
  @IsOptional()
  @Transform(({ value }) => (value == null ? value : String(value)))
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  truckNumber?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}

export class EmailQueryDto {
  @IsEmail()
  email: string;
}

export class DriverAccountDto {
  @IsString()
  @MinLength(8)
  password: string;
}

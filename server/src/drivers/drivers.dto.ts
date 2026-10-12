import { PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { OptionalRef, RESOURCE_STATUSES, ResourceStatus } from "../common/assignable";

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

  /** The truck this driver is seated in; "" or null takes them out of their truck. */
  @OptionalRef()
  truckId?: string | null;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(RESOURCE_STATUSES)
  status?: ResourceStatus;
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

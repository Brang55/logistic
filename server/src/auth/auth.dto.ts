import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { userRole, UserRole } from "../db/schema";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsIn(userRole.enumValues)
  role?: UserRole;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

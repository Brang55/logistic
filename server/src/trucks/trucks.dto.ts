import { PartialType } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateTruckDto {
  @IsString()
  @IsNotEmpty()
  truckNumber: string;

  @IsOptional()
  @IsString()
  truckModel?: string;

  @IsOptional()
  @IsString()
  engineVariation?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsString()
  vin?: string;

  /** Vehicle height in meters (Mapbox max_height accepts 0–10). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  heightM?: number;

  /** Vehicle width in meters (Mapbox max_width accepts 0–10). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  widthM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthM?: number;

  /** Gross weight in metric tons (Mapbox max_weight accepts 0–100). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weightT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  axles?: number;
}

export class UpdateTruckDto extends PartialType(CreateTruckDto) {}

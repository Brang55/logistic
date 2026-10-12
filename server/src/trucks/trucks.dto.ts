import { PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { OptionalRef, RESOURCE_STATUSES, ResourceStatus } from "../common/assignable";

// Form inputs arrive as strings; an empty input clears the value instead of becoming 0.
// Reads the raw input because implicit conversion has already turned "" into 0.
const ToOptionalNumber = () =>
  Transform(({ obj, key }) => {
    const raw = obj[key];
    return raw === "" || raw === null ? null : Number(raw);
  });

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
  @IsIn(RESOURCE_STATUSES)
  status?: ResourceStatus;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsString()
  vin?: string;

  /** The vehicle's id in the telematics provider, used to match incoming positions. */
  @IsOptional()
  @Transform(({ value }) => (value === "" ? null : value))
  @IsString()
  telematicsId?: string | null;

  /** Vehicle height in meters (Mapbox max_height accepts 0–10). */
  @ToOptionalNumber()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  heightM?: number | null;

  /** Vehicle width in meters (Mapbox max_width accepts 0–10). */
  @ToOptionalNumber()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  widthM?: number | null;

  @ToOptionalNumber()
  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthM?: number | null;

  /** Gross weight in metric tons (Mapbox max_weight accepts 0–100). */
  @ToOptionalNumber()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weightT?: number | null;

  @ToOptionalNumber()
  @IsOptional()
  @IsInt()
  @Min(1)
  axles?: number | null;

  @ToOptionalNumber()
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number | null;

  /** The trailer hooked up now; "" or null for none. The driver is seated from the driver's profile. */
  @OptionalRef()
  trailerId?: string | null;
}

export class UpdateTruckDto extends PartialType(CreateTruckDto) {}

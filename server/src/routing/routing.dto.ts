import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsUUID } from "class-validator";
import { IsLngLat } from "../common/lnglat";
import { LngLat } from "./routing.types";

export class RouteDto {
  /** [longitude, latitude] pairs, in visiting order. */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(25)
  @IsLngLat({ each: true })
  coordinates: LngLat[];

  /** Route with this truck's height, width and weight limits. */
  @IsOptional()
  @IsUUID()
  truckId?: string;

  @IsOptional()
  @IsBoolean()
  alternatives?: boolean;
}

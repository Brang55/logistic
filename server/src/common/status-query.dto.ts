import { IsIn, IsOptional } from "class-validator";
import { RESOURCE_STATUSES, ResourceStatus } from "./assignable";
import { CARGO_STATUSES, CargoStatus } from "./cargo-status";

export class CargoStatusQueryDto {
  @IsOptional()
  @IsIn(CARGO_STATUSES)
  status?: CargoStatus;
}

/** Status filter for trucks, trailers and drivers. */
export class StatusQueryDto {
  @IsOptional()
  @IsIn(RESOURCE_STATUSES)
  status?: ResourceStatus;
}

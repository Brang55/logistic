import { PartialType, PickType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { OptionalRef } from "../common/assignable";

// The cargo form sends numeric inputs (quantity, weight) as numbers or strings.
const AsString = () => (target: object, key: string) => {
  Transform(({ value }) => (value == null ? value : String(value)))(target, key);
  IsString()(target, key);
};

// Pickup/delivery dates are calendar days ("" when not planned yet), so they sort and compare as text.
const OptionalDay = () => Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: "$property must be a YYYY-MM-DD date" });

export class CreateCargoDto {
  @IsOptional()
  @AsString()
  shipperName?: string;

  @IsOptional()
  @AsString()
  shipperAddress?: string;

  @IsOptional()
  @AsString()
  contactPerson?: string;

  @IsOptional()
  @AsString()
  phoneNumber?: string;

  @IsOptional()
  @AsString()
  emailAddress?: string;

  @IsOptional()
  @AsString()
  receiverName?: string;

  @IsOptional()
  @AsString()
  receiverAddress?: string;

  @IsOptional()
  @AsString()
  receiverContact?: string;

  @IsOptional()
  @AsString()
  receiverPhone?: string;

  @IsOptional()
  @AsString()
  receiverEmail?: string;

  @IsOptional()
  @AsString()
  descriptionOfGoods?: string;

  @IsOptional()
  @AsString()
  quantity?: string;

  @IsOptional()
  @AsString()
  @Matches(/^(\d+(\.\d+)?)?$/, { message: "weight must be a number of kilograms" })
  weight?: string;

  @IsOptional()
  @AsString()
  dimensions?: string;

  @IsOptional()
  @AsString()
  @OptionalDay()
  pickupDate?: string;

  @IsOptional()
  @AsString()
  @OptionalDay()
  deliveryDate?: string;

  @IsOptional()
  @AsString()
  pickupLocation?: string;

  @IsOptional()
  @AsString()
  deliveryLocation?: string;

  @IsOptional()
  @AsString()
  truckType?: string;

  @IsOptional()
  @AsString()
  serviceType?: string;

  @IsOptional()
  @AsString()
  temperatureControl?: string;

  @IsOptional()
  @AsString()
  hazardousMaterial?: string;

  @IsOptional()
  @AsString()
  specialHandlingInstructions?: string;

  @IsOptional()
  @AsString()
  freightCost?: string;

  @IsOptional()
  @AsString()
  paymentTerms?: string;

  @IsOptional()
  @AsString()
  notes?: string;

  /** The truck brings its seated driver; set this only for a different (relief) driver on this load. */
  @OptionalRef()
  driverId?: string | null;

  @OptionalRef()
  truckId?: string | null;

  /** Defaults to the trailer hooked to a newly chosen truck. */
  @OptionalRef()
  trailerId?: string | null;
}

export class UpdateCargoDto extends PartialType(CreateCargoDto) {}

export class AssignCargoDto extends PickType(UpdateCargoDto, ["driverId", "truckId", "trailerId"] as const) {
  /** Assign even though the truck's route breaks height/weight limits; recorded on the cargo. */
  @IsOptional()
  @IsBoolean()
  acceptRestrictions?: boolean;
}

export class CargoRouteQueryDto {
  /** Route with this truck instead of the assigned one. */
  @IsOptional()
  @IsUUID()
  truckId?: string;

  /** Optional start point "lng,lat", e.g. the truck's current position. */
  @IsOptional()
  @IsString()
  from?: string;
}

import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AssistantMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text: string;

  /** Continues an earlier exchange, so follow-ups like "no, truck 14" work. */
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  /** The page the user has open, e.g. "/cargoList/<id>/preview". */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  page?: string;
}

export class ConfirmActionDto {
  /** Assign even though the truck's route breaks height or weight limits. */
  @IsOptional()
  @IsBoolean()
  acceptRestrictions?: boolean;
}

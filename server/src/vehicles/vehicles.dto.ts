import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";
import { CHECKLISTS } from "./checklists";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Multipart forms send everything as strings; "" means "not set".
const EmptyToNull = () => Transform(({ value }) => (value === "" ? null : value));
const ToInt = () =>
  Transform(({ obj, key }) => {
    const raw = obj[key];
    if (raw === undefined) return undefined;
    return raw === "" || raw === null ? null : Number(raw);
  });

export const DOCUMENT_TYPES = [
  "registration",
  "insurance",
  "technical_inspection",
  "tachograph",
  "adr",
  "cmr_insurance",
  "road_tax",
  "permit",
  "other",
] as const;

export const LOG_KINDS = ["service", "repair", "inspection", "damage", "note"] as const;

export class DocumentDto {
  @IsIn(DOCUMENT_TYPES)
  type: (typeof DOCUMENT_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  number?: string;

  @IsOptional()
  @EmptyToNull()
  @Matches(DATE, { message: "issuedOn must be YYYY-MM-DD" })
  issuedOn?: string | null;

  @IsOptional()
  @EmptyToNull()
  @Matches(DATE, { message: "expiresOn must be YYYY-MM-DD" })
  expiresOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateDocumentDto extends DocumentDto {
  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  declare type: (typeof DOCUMENT_TYPES)[number];

  /** "true" removes the attached file. */
  @IsOptional()
  @IsIn(["true", "false"])
  removeFile?: string;
}

export class MaintenanceItemDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  intervalDays?: number | null;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(1)
  intervalKm?: number | null;

  @IsOptional()
  @EmptyToNull()
  @Matches(DATE, { message: "lastDoneOn must be YYYY-MM-DD" })
  lastDoneOn?: string | null;

  @IsOptional()
  @ToInt()
  @IsInt()
  @Min(0)
  lastDoneKm?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateMaintenanceItemDto extends MaintenanceItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  declare title: string;
}

export class MarkDoneDto {
  @IsOptional()
  @Matches(DATE, { message: "doneOn must be YYYY-MM-DD" })
  doneOn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ChecklistDto {
  @IsIn(Object.keys(CHECKLISTS))
  checklist: string;
}

export class LogEntryDto {
  @IsOptional()
  @Matches(DATE, { message: "entryDate must be YYYY-MM-DD" })
  entryDate?: string;

  @IsOptional()
  @IsIn(LOG_KINDS)
  kind?: (typeof LOG_KINDS)[number];

  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometerKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

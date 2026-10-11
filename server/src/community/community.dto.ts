import { Transform } from "class-transformer";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { REPORT_TYPE_KEYS, ReportType } from "./report-types";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class RoadReportDto {
  @IsIn(REPORT_TYPE_KEYS)
  type: ReportType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  note?: string;
}

export class ChatMessageDto {
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(1000)
  body: string;
}

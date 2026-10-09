import { ArgumentsHost, Catch, HttpStatus } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Response } from "express";

// Maps Postgres constraint errors (possibly wrapped by Drizzle) to HTTP responses;
// everything else falls through to Nest's default handling.
const PG_STATUS: Record<string, [number, string]> = {
  "23505": [HttpStatus.CONFLICT, "Record already exists"],
  "23503": [HttpStatus.BAD_REQUEST, "Referenced record does not exist"],
  "22P02": [HttpStatus.BAD_REQUEST, "Invalid identifier"],
};

@Catch()
export class PgErrorFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const err = exception as { code?: string; cause?: { code?: string; detail?: string } };
    const code = err?.cause?.code ?? err?.code;
    const mapped = code ? PG_STATUS[code] : undefined;
    if (!mapped) return super.catch(exception, host);

    const [statusCode, message] = mapped;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message, detail: err.cause?.detail });
  }
}

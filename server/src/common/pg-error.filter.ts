import { ArgumentsHost, Catch, HttpStatus, Logger } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Response } from "express";

// Maps Postgres constraint errors (possibly wrapped by Drizzle) to HTTP responses;
// everything else falls through to Nest's default handling.
const PG_STATUS: Record<string, [number, string]> = {
  "23505": [HttpStatus.CONFLICT, "Record already exists"],
  "23503": [HttpStatus.BAD_REQUEST, "Referenced record does not exist"],
  "23514": [HttpStatus.BAD_REQUEST, "Value is not allowed"],
  "22P02": [HttpStatus.BAD_REQUEST, "Invalid identifier"],
};

@Catch()
export class PgErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PgErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const err = exception as { code?: string; cause?: { code?: string; detail?: string } };
    const code = err?.cause?.code ?? err?.code;
    const mapped = code ? PG_STATUS[code] : undefined;
    if (!mapped) return super.catch(exception, host);

    const [statusCode, message] = mapped;
    // Postgres details name tables, columns and values, so they stay in the log.
    if (err.cause?.detail) this.logger.debug(`${code}: ${err.cause.detail}`);
    host.switchToHttp().getResponse<Response>().status(statusCode).json({ statusCode, message });
  }
}

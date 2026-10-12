import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  Type,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { createReadStream } from "fs";
import { AuthUser, CurrentUser } from "../auth/auth-user";
import { ManageFleet } from "../auth/roles.decorator";
import { UploadedScan, VehicleKind, VehicleRecordsService } from "./vehicle-records.service";
import {
  ChecklistDto,
  DocumentDto,
  LogEntryDto,
  MaintenanceItemDto,
  MarkDoneDto,
  UpdateDocumentDto,
  UpdateMaintenanceItemDto,
} from "./vehicles.dto";

/**
 * Records routes for one vehicle kind (/trucks/:id/... or /trailers/:id/...). Built by a
 * factory because Express 5 paths can't express "trucks|trailers" as a parameter.
 */
export function vehicleRecordsController(kind: VehicleKind): Type<unknown> {
  @ApiTags(`${kind} records`)
  @ApiBearerAuth()
  @ManageFleet()
  @Controller(kind)
  class VehicleRecordsController {
    constructor(readonly records: VehicleRecordsService) {}

    @Get(":vehicleId/documents")
    listDocuments(@Param("vehicleId", ParseUUIDPipe) vehicleId: string) {
      return this.records.listDocuments(kind, vehicleId);
    }

    @Post(":vehicleId/documents")
    @ApiConsumes("multipart/form-data")
    @UseInterceptors(FileInterceptor("file"))
    createDocument(
      @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
      @Body() dto: DocumentDto,
      @UploadedFile() file?: UploadedScan,
    ) {
      return this.records.createDocument(kind, vehicleId, dto, file);
    }

    @Patch(":vehicleId/documents/:docId")
    @ApiConsumes("multipart/form-data")
    @UseInterceptors(FileInterceptor("file"))
    updateDocument(
      @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
      @Param("docId", ParseUUIDPipe) docId: string,
      @Body() dto: UpdateDocumentDto,
      @UploadedFile() file?: UploadedScan,
    ) {
      return this.records.updateDocument(kind, vehicleId, docId, dto, file);
    }

    @Delete(":vehicleId/documents/:docId")
    @HttpCode(204)
    deleteDocument(@Param("vehicleId", ParseUUIDPipe) vehicleId: string, @Param("docId", ParseUUIDPipe) docId: string) {
      return this.records.deleteDocument(kind, vehicleId, docId);
    }

    @Get(":vehicleId/maintenance")
    listMaintenance(@Param("vehicleId", ParseUUIDPipe) vehicleId: string) {
      return this.records.listMaintenance(kind, vehicleId);
    }

    @Post(":vehicleId/maintenance")
    createMaintenance(@Param("vehicleId", ParseUUIDPipe) vehicleId: string, @Body() dto: MaintenanceItemDto) {
      return this.records.createMaintenance(kind, vehicleId, dto);
    }

    @Post(":vehicleId/maintenance/checklist")
    @HttpCode(200)
    applyChecklist(@Param("vehicleId", ParseUUIDPipe) vehicleId: string, @Body() dto: ChecklistDto) {
      return this.records.applyChecklist(kind, vehicleId, dto);
    }

    @Patch(":vehicleId/maintenance/:itemId")
    updateMaintenance(
      @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
      @Param("itemId", ParseUUIDPipe) itemId: string,
      @Body() dto: UpdateMaintenanceItemDto,
    ) {
      return this.records.updateMaintenance(kind, vehicleId, itemId, dto);
    }

    @Delete(":vehicleId/maintenance/:itemId")
    @HttpCode(204)
    deleteMaintenance(@Param("vehicleId", ParseUUIDPipe) vehicleId: string, @Param("itemId", ParseUUIDPipe) itemId: string) {
      return this.records.deleteMaintenance(kind, vehicleId, itemId);
    }

    @Post(":vehicleId/maintenance/:itemId/done")
    @HttpCode(200)
    markDone(
      @CurrentUser() user: AuthUser,
      @Param("vehicleId", ParseUUIDPipe) vehicleId: string,
      @Param("itemId", ParseUUIDPipe) itemId: string,
      @Body() dto: MarkDoneDto,
    ) {
      return this.records.markDone(kind, vehicleId, itemId, dto, user.email);
    }

    @Get(":vehicleId/log")
    listLog(@Param("vehicleId", ParseUUIDPipe) vehicleId: string) {
      return this.records.listLog(kind, vehicleId);
    }

    @Post(":vehicleId/log")
    addLog(@CurrentUser() user: AuthUser, @Param("vehicleId", ParseUUIDPipe) vehicleId: string, @Body() dto: LogEntryDto) {
      return this.records.addLog(kind, vehicleId, dto, user.email);
    }

    @Delete(":vehicleId/log/:entryId")
    @HttpCode(204)
    deleteLog(@Param("vehicleId", ParseUUIDPipe) vehicleId: string, @Param("entryId", ParseUUIDPipe) entryId: string) {
      return this.records.deleteLog(kind, vehicleId, entryId);
    }
  }
  return VehicleRecordsController;
}

// Header-safe file name: ASCII fallback plus the UTF-8 original (RFC 6266).
const contentDisposition = (name: string, inline: boolean) => {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

@ApiTags("vehicle records")
@ApiBearerAuth()
@ManageFleet()
@Controller()
export class FleetRecordsController {
  constructor(private readonly records: VehicleRecordsService) {}

  /** Expired/expiring documents and overdue/due-soon checks across the fleet. */
  @Get("fleet/attention")
  attention() {
    return this.records.attention();
  }

  @Get("vehicle-documents/:docId/file")
  async download(@Param("docId", ParseUUIDPipe) docId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.records.documentFile(docId);
    // PDFs and images open in the browser; anything else downloads.
    const inline = file.mime === "application/pdf" || file.mime.startsWith("image/");
    res.set({ "Content-Type": file.mime, "Content-Disposition": contentDisposition(file.name, inline) });
    return new StreamableFile(createReadStream(file.path));
  }
}

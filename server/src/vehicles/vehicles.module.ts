import { BadRequestException, Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { LiveModule } from "../live/live.module";
import { ComplianceMonitor } from "./compliance-monitor.service";
import { FleetRecordsController, vehicleRecordsController } from "./vehicle-records.controller";
import { VehicleRecordsService } from "./vehicle-records.service";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

@Module({
  imports: [
    LiveModule,
    // Scans are held in memory, then written by the service under a random name.
    MulterModule.register({
      limits: { fileSize: MAX_FILE_BYTES, files: 1 },
      fileFilter: (_req, file, accept) =>
        ALLOWED_TYPES.includes(file.mimetype)
          ? accept(null, true)
          : accept(new BadRequestException("Only PDF, JPEG, PNG, WebP or HEIC files can be attached"), false),
    }),
  ],
  controllers: [vehicleRecordsController("trucks"), vehicleRecordsController("trailers"), FleetRecordsController],
  providers: [VehicleRecordsService, ComplianceMonitor],
  exports: [VehicleRecordsService],
})
export class VehiclesModule {}

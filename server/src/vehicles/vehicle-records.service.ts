import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, desc, eq, isNotNull, SQL } from "drizzle-orm";
import { AnyPgColumn } from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { maintenanceItems, trailers, trucks, vehicleDocuments, vehicleLog } from "../db/schema";
import { CHECKLISTS } from "./checklists";
import { documentStatus, maintenanceDue, today } from "./record-status";
import {
  ChecklistDto,
  DocumentDto,
  LogEntryDto,
  MaintenanceItemDto,
  MarkDoneDto,
  UpdateDocumentDto,
  UpdateMaintenanceItemDto,
} from "./vehicles.dto";

export type VehicleKind = "trucks" | "trailers";

export interface UploadedScan {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

type Document = typeof vehicleDocuments.$inferSelect;
type MaintenanceItem = typeof maintenanceItems.$inferSelect;

/** Something on a vehicle that needs attention: an expiring document or a due check. */
export interface AttentionItem {
  kind: VehicleKind;
  vehicleId: string;
  vehicleLabel: string;
  recordType: "document" | "maintenance";
  recordId: string;
  title: string;
  status: "expired" | "expiring" | "overdue" | "due_soon";
  dueOn: string | null;
  daysLeft: number | null;
  kmLeft: number | null;
}

const DOCUMENT_TITLES: Record<string, string> = {
  registration: "Registration certificate",
  insurance: "Insurance",
  technical_inspection: "Technical inspection",
  tachograph: "Tachograph calibration",
  adr: "ADR certificate",
  cmr_insurance: "CMR insurance",
  road_tax: "Road tax / vignette",
  permit: "Permit",
  other: "Document",
};

/**
 * The per-vehicle notepad: documents with expiry dates and scans, recurring maintenance
 * checks, and a free-form logbook. Shared by trucks and trailers.
 */
@Injectable()
export class VehicleRecordsService {
  private readonly logger = new Logger(VehicleRecordsService.name);
  readonly uploadDir: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    config: ConfigService,
  ) {
    this.uploadDir = resolve(config.get<string>("UPLOAD_DIR") || "uploads");
    mkdirSync(this.uploadDir, { recursive: true });
  }

  /** The foreign-key column and filter for one vehicle. */
  private ref(kind: VehicleKind, vehicleId: string) {
    return kind === "trucks" ? { truckId: vehicleId } : { trailerId: vehicleId };
  }

  private owns(table: { truckId: AnyPgColumn; trailerId: AnyPgColumn }, kind: VehicleKind, vehicleId: string): SQL {
    return kind === "trucks" ? eq(table.truckId, vehicleId) : eq(table.trailerId, vehicleId);
  }

  async vehicle(kind: VehicleKind, vehicleId: string) {
    if (kind === "trucks") {
      const truck = await this.db.query.trucks.findFirst({ where: eq(trucks.id, vehicleId) });
      if (!truck) throw new NotFoundException("Truck not found");
      return { label: truck.truckNumber, odometerKm: truck.odometerKm };
    }
    const trailer = await this.db.query.trailers.findFirst({ where: eq(trailers.id, vehicleId) });
    if (!trailer) throw new NotFoundException("Trailer not found");
    return { label: trailer.trailerNumber, odometerKm: null };
  }

  // ---- Documents ----

  async listDocuments(kind: VehicleKind, vehicleId: string) {
    await this.vehicle(kind, vehicleId);
    const rows = await this.db
      .select()
      .from(vehicleDocuments)
      .where(this.owns(vehicleDocuments, kind, vehicleId))
      .orderBy(asc(vehicleDocuments.expiresOn));
    return rows.map(withDocumentStatus);
  }

  async createDocument(kind: VehicleKind, vehicleId: string, dto: DocumentDto, file?: UploadedScan) {
    await this.vehicle(kind, vehicleId);
    const stored = file ? await this.store(file) : {};
    const [doc] = await this.db
      .insert(vehicleDocuments)
      .values({ ...this.ref(kind, vehicleId), ...dto, title: dto.title || DOCUMENT_TITLES[dto.type], ...stored })
      .returning();
    return withDocumentStatus(doc);
  }

  async updateDocument(kind: VehicleKind, vehicleId: string, docId: string, dto: UpdateDocumentDto, file?: UploadedScan) {
    const current = await this.findDocument(kind, vehicleId, docId);
    const { removeFile, ...changes } = dto;
    let fileChanges = {};
    if (file || removeFile === "true") {
      await this.discard(current.fileKey);
      fileChanges = file ? await this.store(file) : { fileKey: null, fileName: null, fileMime: null, fileSize: null };
    }
    const [doc] = await this.db
      .update(vehicleDocuments)
      .set({ ...changes, ...fileChanges })
      .where(eq(vehicleDocuments.id, docId))
      .returning();
    return withDocumentStatus(doc);
  }

  async deleteDocument(kind: VehicleKind, vehicleId: string, docId: string) {
    const doc = await this.findDocument(kind, vehicleId, docId);
    await this.db.delete(vehicleDocuments).where(eq(vehicleDocuments.id, docId));
    await this.discard(doc.fileKey);
  }

  /** Path and metadata of a document's scan, for download. */
  async documentFile(docId: string) {
    const doc = await this.db.query.vehicleDocuments.findFirst({ where: eq(vehicleDocuments.id, docId) });
    if (!doc?.fileKey) throw new NotFoundException("No file attached");
    return { path: join(this.uploadDir, doc.fileKey), name: doc.fileName ?? "document", mime: doc.fileMime ?? "application/octet-stream" };
  }

  private async findDocument(kind: VehicleKind, vehicleId: string, docId: string) {
    const doc = await this.db.query.vehicleDocuments.findFirst({
      where: and(eq(vehicleDocuments.id, docId), this.owns(vehicleDocuments, kind, vehicleId)),
    });
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  // Files are stored under a random key; the uploaded name is kept only as metadata.
  private async store(file: UploadedScan) {
    const fileKey = randomUUID();
    await writeFile(join(this.uploadDir, fileKey), file.buffer);
    return { fileKey, fileName: file.originalname, fileMime: file.mimetype, fileSize: file.size };
  }

  private async discard(fileKey: string | null) {
    if (!fileKey) return;
    await rm(join(this.uploadDir, fileKey), { force: true }).catch((err) => this.logger.warn(`Could not delete ${fileKey}: ${err.message}`));
  }

  // ---- Maintenance ----

  async listMaintenance(kind: VehicleKind, vehicleId: string) {
    const { odometerKm } = await this.vehicle(kind, vehicleId);
    const rows = await this.db
      .select()
      .from(maintenanceItems)
      .where(this.owns(maintenanceItems, kind, vehicleId))
      .orderBy(asc(maintenanceItems.title));
    return rows.map((item) => withMaintenanceStatus(item, odometerKm)).sort(byUrgency);
  }

  async createMaintenance(kind: VehicleKind, vehicleId: string, dto: MaintenanceItemDto) {
    const { odometerKm } = await this.vehicle(kind, vehicleId);
    const [item] = await this.db
      .insert(maintenanceItems)
      .values({ ...this.ref(kind, vehicleId), ...dto, type: dto.type || "custom" })
      .returning();
    return withMaintenanceStatus(item, odometerKm);
  }

  async updateMaintenance(kind: VehicleKind, vehicleId: string, itemId: string, dto: UpdateMaintenanceItemDto) {
    const { odometerKm } = await this.vehicle(kind, vehicleId);
    await this.findMaintenance(kind, vehicleId, itemId);
    const [item] = await this.db.update(maintenanceItems).set(dto).where(eq(maintenanceItems.id, itemId)).returning();
    return withMaintenanceStatus(item, odometerKm);
  }

  async deleteMaintenance(kind: VehicleKind, vehicleId: string, itemId: string) {
    await this.findMaintenance(kind, vehicleId, itemId);
    await this.db.delete(maintenanceItems).where(eq(maintenanceItems.id, itemId));
  }

  /** Records a completed check: resets its schedule and writes a logbook entry. */
  async markDone(kind: VehicleKind, vehicleId: string, itemId: string, dto: MarkDoneDto, authorEmail: string) {
    const item = await this.findMaintenance(kind, vehicleId, itemId);
    const { odometerKm } = await this.vehicle(kind, vehicleId);
    const doneOn = dto.doneOn ?? today();
    const doneKm = dto.odometerKm ?? odometerKm;

    const [updated] = await this.db
      .update(maintenanceItems)
      .set({ lastDoneOn: doneOn, lastDoneKm: doneKm })
      .where(eq(maintenanceItems.id, itemId))
      .returning();
    await this.addLog(
      kind,
      vehicleId,
      {
        entryDate: doneOn,
        kind: "service",
        title: item.title,
        odometerKm: dto.odometerKm,
        cost: dto.cost,
        currency: dto.currency,
        notes: dto.notes,
      },
      authorEmail,
      itemId,
    );
    const { odometerKm: latestKm } = await this.vehicle(kind, vehicleId);
    return withMaintenanceStatus(updated, latestKm);
  }

  /** Adds a standard checklist's items that the vehicle doesn't have yet (matched by type). */
  async applyChecklist(kind: VehicleKind, vehicleId: string, dto: ChecklistDto) {
    await this.vehicle(kind, vehicleId);
    const existing = new Set(
      (await this.db.select({ type: maintenanceItems.type }).from(maintenanceItems).where(this.owns(maintenanceItems, kind, vehicleId))).map(
        (row) => row.type,
      ),
    );
    const missing = CHECKLISTS[dto.checklist].items.filter((item) => !existing.has(item.type));
    if (missing.length) {
      await this.db.insert(maintenanceItems).values(missing.map((item) => ({ ...this.ref(kind, vehicleId), ...item })));
    }
    return { added: missing.length };
  }

  private async findMaintenance(kind: VehicleKind, vehicleId: string, itemId: string): Promise<MaintenanceItem> {
    const item = await this.db.query.maintenanceItems.findFirst({
      where: and(eq(maintenanceItems.id, itemId), this.owns(maintenanceItems, kind, vehicleId)),
    });
    if (!item) throw new NotFoundException("Maintenance item not found");
    return item;
  }

  // ---- Logbook ----

  async listLog(kind: VehicleKind, vehicleId: string) {
    await this.vehicle(kind, vehicleId);
    return this.db
      .select()
      .from(vehicleLog)
      .where(this.owns(vehicleLog, kind, vehicleId))
      .orderBy(desc(vehicleLog.entryDate), desc(vehicleLog.createdAt));
  }

  /** A higher odometer reading also becomes the truck's current odometer. */
  async addLog(kind: VehicleKind, vehicleId: string, dto: LogEntryDto, authorEmail: string, maintenanceItemId?: string) {
    const { odometerKm } = await this.vehicle(kind, vehicleId);
    const [entry] = await this.db
      .insert(vehicleLog)
      .values({
        ...this.ref(kind, vehicleId),
        ...dto,
        entryDate: dto.entryDate ?? today(),
        kind: dto.kind ?? "note",
        maintenanceItemId,
        authorEmail,
      })
      .returning();
    if (kind === "trucks" && dto.odometerKm !== undefined && dto.odometerKm > (odometerKm ?? -1)) {
      await this.db.update(trucks).set({ odometerKm: dto.odometerKm }).where(eq(trucks.id, vehicleId));
    }
    return entry;
  }

  async deleteLog(kind: VehicleKind, vehicleId: string, entryId: string) {
    const [entry] = await this.db
      .delete(vehicleLog)
      .where(and(eq(vehicleLog.id, entryId), this.owns(vehicleLog, kind, vehicleId)))
      .returning({ id: vehicleLog.id });
    if (!entry) throw new NotFoundException("Log entry not found");
  }

  // ---- Fleet-wide ----

  /** Every expired/expiring document and overdue/due-soon check, most urgent first. */
  async attention(): Promise<AttentionItem[]> {
    const [truckRows, trailerRows, docs, items] = await Promise.all([
      this.db.select({ id: trucks.id, label: trucks.truckNumber, odometerKm: trucks.odometerKm }).from(trucks),
      this.db.select({ id: trailers.id, label: trailers.trailerNumber }).from(trailers),
      this.db.select().from(vehicleDocuments).where(isNotNull(vehicleDocuments.expiresOn)),
      this.db.select().from(maintenanceItems),
    ]);
    const truckById = new Map(truckRows.map((t) => [t.id, t]));
    const trailerById = new Map(trailerRows.map((t) => [t.id, t]));
    const owner = (row: { truckId: string | null; trailerId: string | null }) =>
      row.truckId
        ? {
            vehicle: { kind: "trucks" as const, vehicleId: row.truckId, vehicleLabel: truckById.get(row.truckId)?.label ?? "" },
            odometerKm: truckById.get(row.truckId)?.odometerKm ?? null,
          }
        : {
            vehicle: { kind: "trailers" as const, vehicleId: row.trailerId!, vehicleLabel: trailerById.get(row.trailerId!)?.label ?? "" },
            odometerKm: null,
          };

    const result: AttentionItem[] = [];
    for (const doc of docs) {
      const { status, daysLeft } = documentStatus(doc.expiresOn);
      if (status !== "expired" && status !== "expiring") continue;
      const { vehicle } = owner(doc);
      result.push({ ...vehicle, recordType: "document", recordId: doc.id, title: doc.title, status, dueOn: doc.expiresOn, daysLeft, kmLeft: null });
    }
    for (const item of items) {
      const { vehicle, odometerKm } = owner(item);
      const due = maintenanceDue(item, odometerKm);
      if (due.status !== "overdue" && due.status !== "due_soon") continue;
      result.push({ ...vehicle, recordType: "maintenance", recordId: item.id, title: item.title, status: due.status, dueOn: due.nextDueOn, daysLeft: due.daysLeft, kmLeft: due.kmLeft });
    }
    const severity = { expired: 0, overdue: 0, expiring: 1, due_soon: 1 };
    return result.sort((a, b) => severity[a.status] - severity[b.status] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  }
}

const withDocumentStatus = (doc: Document) => {
  const { fileKey, ...rest } = doc;
  return { ...rest, hasFile: !!fileKey, ...documentStatus(doc.expiresOn) };
};

const withMaintenanceStatus = (item: MaintenanceItem, odometerKm: number | null) => ({
  ...item,
  ...maintenanceDue(item, odometerKm),
});

const URGENCY = { overdue: 0, due_soon: 1, not_started: 2, ok: 3 };
const byUrgency = (a: { status: keyof typeof URGENCY }, b: { status: keyof typeof URGENCY }) => URGENCY[a.status] - URGENCY[b.status];

import { existsSync, readdirSync } from "fs";
import { newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";

describe("vehicle records (e2e)", () => {
  let t: TestApp;
  let truck: { id: string };
  let trailer: { id: string };
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const loadTruck = async () => (await t.asDispatcher(t.api().get(`/api/trucks/${truck.id}`))).body;

  beforeAll(async () => {
    t = await createTestApp();
    truck = await newTruck(t, { truckNumber: "DOC-1", odometerKm: 100000 });
    trailer = (
      await t.asDispatcher(t.api().post("/api/trailers")).send({ trailerNumber: "DOC-T1", trailer: "Reefer" }).expect(201)
    ).body;
  });
  afterAll(() => t.close());

  it("stores documents with an attached scan and serves it back", async () => {
    const pdf = Buffer.from("%PDF-1.4 test document");
    const created = await t
      .asDispatcher(t.api().post(`/api/trucks/${truck.id}/documents`))
      .field("type", "insurance")
      .field("number", "POL-123")
      .field("expiresOn", day(12))
      .attach("file", pdf, { filename: "Polica 2026.pdf", contentType: "application/pdf" })
      .expect(201);
    expect(created.body).toMatchObject({
      type: "insurance",
      title: "Insurance",
      number: "POL-123",
      status: "expiring",
      daysLeft: 12,
      hasFile: true,
      fileName: "Polica 2026.pdf",
    });
    expect(created.body.fileKey).toBeUndefined();

    const file = await t.asDispatcher(t.api().get(`/api/vehicle-documents/${created.body.id}/file`)).expect(200);
    expect(file.headers["content-type"]).toContain("application/pdf");
    expect(file.headers["content-disposition"]).toContain("inline");
    expect(Buffer.from(file.body).toString()).toBe(pdf.toString());

    const filesBefore = readdirSync(t.uploadDir).length;
    await t.asDispatcher(t.api().delete(`/api/trucks/${truck.id}/documents/${created.body.id}`)).expect(204);
    expect(readdirSync(t.uploadDir).length).toBe(filesBefore - 1);
  });

  it("rejects unsupported and oversized files", async () => {
    const upload = () => t.asDispatcher(t.api().post(`/api/trucks/${truck.id}/documents`)).field("type", "permit");
    await upload().attach("file", Buffer.from("#!/bin/sh"), { filename: "run.sh", contentType: "application/x-sh" }).expect(400);
    await upload()
      .attach("file", Buffer.alloc(11 * 1024 * 1024), { filename: "big.pdf", contentType: "application/pdf" })
      .expect(413);
  });

  it("tracks maintenance by date and distance, and logs completed checks", async () => {
    const oil = (
      await t
        .asDispatcher(t.api().post(`/api/trucks/${truck.id}/maintenance`))
        .send({ title: "Engine oil", type: "oil_change", intervalKm: 60000, intervalDays: 365, lastDoneOn: day(-30), lastDoneKm: 41000 })
        .expect(201)
    ).body;
    // Due at 41,000 + 60,000 = 101,000 km; the truck is at 100,000, so 1,000 km left.
    expect(oil).toMatchObject({ status: "due_soon", nextDueKm: 101000, kmLeft: 1000 });

    const done = await t
      .asDispatcher(t.api().post(`/api/trucks/${truck.id}/maintenance/${oil.id}/done`))
      .send({ odometerKm: 100500, cost: 420, currency: "EUR", notes: "Synthetic 10W-40" })
      .expect(200);
    expect(done.body).toMatchObject({ status: "ok", lastDoneOn: day(0), lastDoneKm: 100500, nextDueKm: 160500 });

    const log = (await t.asDispatcher(t.api().get(`/api/trucks/${truck.id}/log`))).body;
    expect(log[0]).toMatchObject({ kind: "service", title: "Engine oil", odometerKm: 100500, cost: 420, maintenanceItemId: oil.id });
    expect((await loadTruck()).odometerKm).toBe(100500);
  });

  it("adds a standard checklist only once", async () => {
    const addChecklist = () =>
      t.asDispatcher(t.api().post(`/api/trailers/${trailer.id}/maintenance/checklist`)).send({ checklist: "trailer" }).expect(200);
    const first = await addChecklist();
    const again = await addChecklist();
    expect([first.body.added, again.body.added]).toEqual([4, 0]);
    const items = (await t.asDispatcher(t.api().get(`/api/trailers/${trailer.id}/maintenance`))).body;
    expect(items.every((i: { status: string }) => i.status === "not_started")).toBe(true);
  });

  it("keeps a notepad and only moves the odometer forward", async () => {
    const addNote = (body: object) => t.asDispatcher(t.api().post(`/api/trucks/${truck.id}/log`)).send(body);
    await addNote({ title: "Small dent, rear left", kind: "damage", odometerKm: 90000 }).expect(201);
    expect((await loadTruck()).odometerKm).toBe(100500);
    const note = (await addNote({ title: "Driver reports noisy fan", odometerKm: 101200 })).body;
    expect(note).toMatchObject({ kind: "note", entryDate: day(0), authorEmail: "dispatcher@test.local" });
    expect((await loadTruck()).odometerKm).toBe(101200);
    await t.asDispatcher(t.api().delete(`/api/trucks/${truck.id}/log/${note.id}`)).expect(204);
  });

  it("lists what needs attention across the fleet", async () => {
    await t
      .asDispatcher(t.api().post(`/api/trailers/${trailer.id}/documents`))
      .field("type", "technical_inspection")
      .field("expiresOn", day(-3))
      .expect(201);
    await t
      .asDispatcher(t.api().post(`/api/trucks/${truck.id}/maintenance`))
      .send({ title: "Brakes", type: "brakes", intervalDays: 182, lastDoneOn: day(-200) })
      .expect(201);
    const attention = (await t.asDispatcher(t.api().get("/api/fleet/attention")).expect(200)).body;
    expect(attention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleLabel: "DOC-T1", recordType: "document", status: "expired", daysLeft: -3 }),
        expect.objectContaining({ vehicleLabel: "DOC-1", recordType: "maintenance", title: "Brakes", status: "overdue" }),
      ]),
    );
    // Most urgent first.
    expect(["expired", "overdue"]).toContain(attention[0].status);
  });

  it("keeps records to staff and to the right vehicle", async () => {
    await t.as(t.tokens.driver)(t.api().get(`/api/trucks/${truck.id}/documents`)).expect(403);
    const doc = (await t.asDispatcher(t.api().post(`/api/trucks/${truck.id}/documents`)).field("type", "permit")).body;
    await t.asDispatcher(t.api().delete(`/api/trailers/${trailer.id}/documents/${doc.id}`)).expect(404);
    expect(existsSync(t.uploadDir)).toBe(true);
  });
});

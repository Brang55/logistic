import { io, Socket } from "socket.io-client";
import { LngLat } from "../../src/routing/routing.types";
import { TestApp, WEBHOOK_SECRET } from "./app";

type Body = Record<string, unknown>;

/** Posts GPS fixes the way a telematics provider does. */
export const webhook = (t: TestApp, positions: object[], secret = WEBHOOK_SECRET) =>
  t.api().post("/api/telematics/webhook").set("x-telematics-secret", secret).send({ positions });

/** Reports one truck at a point. */
export const moveTruck = (t: TestApp, vehicleId: string, [lng, lat]: LngLat) =>
  webhook(t, [{ vehicleId, lng, lat }]);

export const newTruck = async (t: TestApp, body: Body) =>
  (await t.asDispatcher(t.api().post("/api/trucks")).send(body).expect(201)).body;

/** A driver record without a login. */
export const newDriver = async (t: TestApp, body: { firstName: string; lastName?: string } & Body) =>
  (
    await t
      .asDispatcher(t.api().post("/api/drivers"))
      .send({ lastName: "Driver", truckDriverEmail: `${String(body.firstName).toLowerCase()}@test.local`, ...body })
      .expect(201)
  ).body;

/** A truck with a driver seated in it, so assigning the truck to a load brings that driver. */
export async function newCrewedTruck(t: TestApp, body: { truckNumber: string } & Body) {
  const truck = await newTruck(t, body);
  const driver = await newDriver(t, { firstName: body.truckNumber, truckId: truck.id });
  return { ...truck, driverId: driver.id, driver };
}

export const newCargo = async (t: TestApp, pickupLocation: string, deliveryLocation: string, extra: Body = {}) =>
  (await t.asDispatcher(t.api().post("/api/cargos")).send({ pickupLocation, deliveryLocation, ...extra }).expect(201))
    .body;

/** A driver record with a driver-app login, and that driver's access token. */
export async function newDriverWithLogin(t: TestApp, body: { firstName: string; lastName: string; email: string } & Body) {
  const { email, ...rest } = body;
  const driver = (
    await t.asDispatcher(t.api().post("/api/drivers")).send({ ...rest, truckDriverEmail: email }).expect(201)
  ).body;
  await t.asDispatcher(t.api().post(`/api/drivers/${driver.id}/account`)).send({ password: "driverpass1" }).expect(201);
  const token: string = (
    await t.api().post("/api/auth/login").send({ email, password: "driverpass1" }).expect(200)
  ).body.accessToken;
  return { driver, token };
}

/** A connected client on the live feed; close it when done. */
export async function connectLive(t: TestApp, token: string): Promise<Socket> {
  const socket = io(t.liveUrl(), { auth: { token }, transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
  });
  return socket;
}

/** Recent dispatcher alerts of one kind for one cargo, newest first. */
export const alertsFor = async (t: TestApp, cargoId: string, kind?: string) =>
  (await t.asDispatcher(t.api().get("/api/traffic/alerts")).expect(200)).body.filter(
    (a: { cargoId?: string; kind: string }) => a.cargoId === cargoId && (!kind || a.kind === kind),
  );

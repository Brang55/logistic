import { describe, expect, it } from "vitest";
import type Cargo from "../app/api/cargos";
import type { Truck } from "../app/api/trucks";
import { crewOf, rankTrucks, seatingEffects, withTruck } from "./crew";

const truck = (id: string, extra: Partial<Truck> = {}): Truck => ({
  id,
  truckNumber: id.toUpperCase(),
  truckModel: "",
  engineVariation: "",
  status: "available",
  ...extra,
});

const cargo = (id: string, extra: Partial<Cargo>) => ({ id, status: "confirmed", ...extra }) as Cargo;

describe("crewOf", () => {
  const trucks = [truck("t1", { driverId: "ann" })];

  it("treats the truck's own driver as no override", () => {
    expect(crewOf({ truckId: "t1", driverId: "ann", trailerId: "x" }, trucks)).toEqual({ truckId: "t1", driverId: "", trailerId: "x" });
  });

  it("keeps a relief driver", () => {
    expect(crewOf({ truckId: "t1", driverId: "bob", trailerId: null }, trucks)).toEqual({ truckId: "t1", driverId: "bob", trailerId: "" });
  });
});

describe("withTruck", () => {
  it("drops the previous truck's hooked trailer when the new truck has none", () => {
    const previous = truck("t1", { trailerId: "hooked" });
    const crew = { truckId: "t1", driverId: "", trailerId: "hooked" };
    expect(withTruck(crew, truck("t2"), previous)).toEqual({ truckId: "t2", driverId: "", trailerId: "" });
  });

  it("brings the truck's hooked trailer and drops a relief driver", () => {
    const crew = { truckId: "t1", driverId: "bob", trailerId: "old" };
    expect(withTruck(crew, truck("t2", { trailerId: "hooked" }))).toEqual({ truckId: "t2", driverId: "", trailerId: "hooked" });
    // A truck without a trailer keeps the one already picked.
    expect(withTruck(crew, truck("t3"))).toEqual({ truckId: "t3", driverId: "", trailerId: "old" });
    expect(withTruck(crew, undefined)).toEqual({ truckId: "", driverId: "", trailerId: "old" });
  });
});

describe("rankTrucks", () => {
  const pickup: [number, number] = [0, 0];
  const trucks = [truck("far"), truck("busy"), truck("near"), truck("lost")];
  const positions = [
    { truckId: "far", point: [0, 3] as [number, number], speedKmh: null, heading: null, recordedAt: "" },
    { truckId: "near", point: [0, 1] as [number, number], speedKmh: null, heading: null, recordedAt: "" },
    // Parked right at the pickup, but busy with a load that ends further away.
    { truckId: "busy", point: [0, 0] as [number, number], speedKmh: null, heading: null, recordedAt: "" },
  ];
  const origins = [{ truckId: "busy", point: [0, 2] as [number, number], afterCargoId: "c1" }];

  it("measures from where each truck will be free, unknown positions last", () => {
    const ranked = rankTrucks(trucks, pickup, positions, origins);
    expect(ranked.map((choice) => choice.truck.id)).toEqual(["near", "busy", "far", "lost"]);
    expect(ranked[1]).toMatchObject({ afterLoads: true });
    expect(ranked[1].km).toBeCloseTo(222.4, 0);
    expect(ranked[3].km).toBeUndefined();
  });

  it("sorts by truck number without a pickup point", () => {
    expect(rankTrucks(trucks).map((choice) => choice.truck.id)).toEqual(["busy", "far", "lost", "near"]);
  });
});

describe("seatingEffects", () => {
  const trucks = [truck("t1", { driverId: "ann" }), truck("t2", { driverId: "bob" })];
  const cargos = [
    cargo("ann-load", { truckId: "t1", driverId: "ann" }),
    cargo("relief-load", { truckId: "t1", driverId: "cat" }),
    cargo("done", { truckId: "t1", driverId: "ann", status: "delivered" }),
    cargo("bob-load", { truckId: "t2", driverId: "bob" }),
  ];

  it("moves the new truck's loads to the driver and leaves their old truck's loads without one", () => {
    const effects = seatingEffects({ id: "bob", truckId: "t2" }, "t1", trucks, cargos);
    expect(effects.gained.map((c) => c.id)).toEqual(["ann-load"]);
    expect(effects.left.map((c) => c.id)).toEqual(["bob-load"]);
    expect(effects.replacedDriverId).toBe("ann");
  });

  it("does nothing when the driver stays in their truck", () => {
    expect(seatingEffects({ id: "ann", truckId: "t1" }, "t1", trucks, cargos)).toEqual({ gained: [], left: [], replacedDriverId: null });
  });

  it("gives a new driver the loads of a truck that had none", () => {
    const empty = [truck("t3")];
    const waiting = [cargo("waiting", { truckId: "t3", driverId: null })];
    expect(seatingEffects(undefined, "t3", empty, waiting).gained.map((c) => c.id)).toEqual(["waiting"]);
  });
});

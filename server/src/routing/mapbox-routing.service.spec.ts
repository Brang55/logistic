import { BadRequestException } from "@nestjs/common";
import { MapboxApiError, MapboxClient } from "../mapbox/mapbox.client";
import { MapboxRoutingService } from "./mapbox-routing.service";
import { LngLat } from "./routing.types";

// Two legs: A -> B (2 segments, points 0-2) and B -> C (2 segments, points 2-4).
const geometry: LngLat[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
];

const directionsResponse = {
  code: "Ok",
  routes: [
    {
      distance: 4000,
      duration: 600,
      duration_typical: 540,
      geometry: { type: "LineString", coordinates: geometry },
      legs: [
        {
          summary: "A1",
          annotation: { distance: [1000, 1000] },
          steps: [{ distance: 2000, duration: 300, maneuver: { instruction: "Head east", location: [0, 0] } }],
          notifications: [{ type: "alert", subtype: "countryBorderCrossing", details: { message: "Crossing BG/RS" } }],
        },
        {
          summary: "E80",
          annotation: { distance: [1000, 1000] },
          steps: [{ distance: 2000, duration: 300, maneuver: { instruction: "Arrive", location: [4, 0] } }],
          notifications: [
            {
              type: "violation",
              subtype: "maxHeight",
              geometry_index_start: 0,
              geometry_index_end: 1,
              details: { message: "Vehicle is 0.1 m too tall" },
            },
          ],
          incidents: [{ id: "i1", type: "construction", description: "Roadworks", impact: "minor", geometry_index_start: 1 }],
        },
      ],
    },
  ],
};

describe("MapboxRoutingService", () => {
  let get: jest.Mock;
  let service: MapboxRoutingService;

  beforeEach(() => {
    get = jest.fn().mockResolvedValue(directionsResponse);
    service = new MapboxRoutingService({ get } as unknown as MapboxClient);
  });

  it("requests a traffic-aware route with the truck's limits", async () => {
    await service.route({
      coordinates: [
        [23.32, 42.69],
        [11.58, 48.13],
      ],
      vehicle: { heightM: 4.0, widthM: 2.55, weightT: 140 },
    });

    const [path, params] = get.mock.calls[0];
    expect(path).toBe("/directions/v5/mapbox/driving-traffic/23.32,42.69;11.58,48.13");
    expect(params).toMatchObject({
      max_height: "4",
      max_width: "2.55",
      // Clamped to the API's 100 t maximum.
      max_weight: "100",
      steps: "true",
      geometries: "geojson",
      overview: "full",
    });
  });

  it("omits limits that are not set", async () => {
    await service.route({ coordinates: [[0, 0], [1, 1]], vehicle: { heightM: null, weightT: 0 } });
    const [, params] = get.mock.calls[0];
    expect(params.max_height).toBeUndefined();
    expect(params.max_weight).toBeUndefined();
  });

  it("maps notices and incidents onto the full route geometry", async () => {
    const [plan] = await service.route({ coordinates: [[0, 0], [2, 0], [4, 0]] });

    expect(plan).toMatchObject({ distanceM: 4000, durationS: 600, typicalDurationS: 540, summary: "A1 → E80" });
    expect(plan.steps.map((s) => s.instruction)).toEqual(["Head east", "Arrive"]);
    expect(plan.notices).toEqual([
      { type: "alert", subtype: "countryBorderCrossing", message: "Crossing BG/RS", coordinates: undefined },
      // Second leg starts at point 2, so leg indices 0-1 are route points 2-3.
      { type: "violation", subtype: "maxHeight", message: "Vehicle is 0.1 m too tall", coordinates: [[2, 0], [3, 0]] },
    ]);
    expect(plan.incidents).toEqual([
      { id: "i1", type: "construction", description: "Roadworks", impact: "minor", closed: false, location: [3, 0] },
    ]);
  });

  it("returns no routes when Mapbox finds none", async () => {
    get.mockRejectedValue(new MapboxApiError(422, "NoRoute", "No route found"));
    await expect(service.route({ coordinates: [[0, 0], [1, 1]] })).resolves.toEqual([]);
  });

  it("rejects invalid input from Mapbox as a bad request", async () => {
    get.mockRejectedValue(new MapboxApiError(422, "InvalidInput", "Coordinate is invalid"));
    await expect(service.route({ coordinates: [[0, 0], [1, 1]] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("caches identical requests", async () => {
    const request = { coordinates: [[0, 0], [1, 1]] as LngLat[] };
    await service.route(request);
    await service.route(request);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

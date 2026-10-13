import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { TomTomApiError, TomTomClient } from "../tomtom/tomtom.client";
import { MapboxRoutingService } from "./mapbox-routing.service";
import { LngLat } from "./routing.types";
import { TomTomRoutingService } from "./tomtom-routing.service";

const pt = ([longitude, latitude]: LngLat) => ({ latitude, longitude });

// Two legs: A -> B (points 0-2) and B -> C (points 3-5); section indices span both legs.
const routeResponse = {
  routes: [
    {
      summary: { lengthInMeters: 5000, travelTimeInSeconds: 700, trafficDelayInSeconds: 120 },
      legs: [
        { summary: { lengthInMeters: 2000, travelTimeInSeconds: 300 }, points: [pt([0, 0]), pt([1, 0]), pt([2, 0])] },
        { summary: { lengthInMeters: 3000, travelTimeInSeconds: 400 }, points: [pt([2, 0]), pt([3, 0]), pt([4, 0])] },
      ],
      sections: [
        { sectionType: "TRAVEL_MODE", travelMode: "truck", startPointIndex: 0, endPointIndex: 3 },
        { sectionType: "TRAVEL_MODE", travelMode: "other", startPointIndex: 4, endPointIndex: 5 },
        { sectionType: "COUNTRY", countryCode: "USA", startPointIndex: 0, endPointIndex: 2 },
        { sectionType: "COUNTRY", countryCode: "CAN", startPointIndex: 3, endPointIndex: 5 },
        { sectionType: "TOLL", startPointIndex: 1, endPointIndex: 2 },
        { sectionType: "TRAFFIC", simpleCategory: "JAM", magnitudeOfDelay: 2, delayInSeconds: 720, startPointIndex: 4, endPointIndex: 5 },
        { sectionType: "TRAFFIC", simpleCategory: "ROAD_CLOSURE", magnitudeOfDelay: 4, eventId: "e9", startPointIndex: 1, endPointIndex: 1 },
      ],
      guidance: {
        instructions: [
          { routeOffsetInMeters: 0, travelTimeInSeconds: 0, point: pt([0, 0]), message: "Leave from Main St", roadNumbers: [] },
          { routeOffsetInMeters: 1500, travelTimeInSeconds: 200, point: pt([1, 0]), message: "Take I-35E", roadNumbers: ["I-35E"] },
          { routeOffsetInMeters: 5000, travelTimeInSeconds: 700, point: pt([4, 0]), message: "You have arrived" },
        ],
      },
    },
  ],
};

describe("TomTomRoutingService", () => {
  let get: jest.Mock;
  let post: jest.Mock;
  let mapboxTimes: jest.Mock;
  let service: TomTomRoutingService;

  beforeEach(() => {
    get = jest.fn().mockResolvedValue(routeResponse);
    post = jest.fn();
    mapboxTimes = jest.fn().mockResolvedValue([{ durationS: 1, distanceM: 2 }]);
    service = new TomTomRoutingService(
      { get, post } as unknown as TomTomClient,
      { travelTimes: mapboxTimes } as unknown as MapboxRoutingService,
    );
  });

  it("requests a truck route in lat,lon order with the truck's dimensions", async () => {
    await service.route({
      coordinates: [
        [-96.797, 32.7767],
        [-87.6298, 41.8781],
      ],
      vehicle: { heightM: 4.11, widthM: 2.6, lengthM: 21.9, weightT: 36.3, axles: 5 },
    });

    const [path, params] = get.mock.calls[0];
    expect(path).toBe("/routing/1/calculateRoute/32.7767,-96.797:41.8781,-87.6298/json");
    expect(params).toMatchObject({
      travelMode: "truck",
      vehicleCommercial: "true",
      traffic: "true",
      maxAlternatives: "2",
      vehicleHeight: "4.11",
      vehicleWidth: "2.6",
      vehicleLength: "21.9",
      vehicleWeight: "36300",
      vehicleNumberOfAxles: "5",
      vehicleAxleWeight: "7260",
    });
    expect(params.sectionType).toEqual(expect.arrayContaining(["traffic", "travelMode"]));
  });

  it("omits limits that are not set and alternatives between waypoints", async () => {
    await service.route({ coordinates: [[0, 0], [1, 1], [2, 2]], vehicle: { heightM: null, weightT: 0, axles: 3 } });
    const [, params] = get.mock.calls[0];
    expect(params.vehicleHeight).toBeUndefined();
    expect(params.vehicleWeight).toBeUndefined();
    expect(params.vehicleAxleWeight).toBeUndefined();
    expect(params.maxAlternatives).toBe("0");
  });

  it("maps the route, restrictions, alerts and traffic onto the plan", async () => {
    const [plan] = await service.route({ coordinates: [[0, 0], [2, 0], [4, 0]] });

    expect(plan).toMatchObject({ distanceM: 5000, durationS: 700, typicalDurationS: 580, summary: "I-35E" });
    expect(plan.geometry.coordinates).toHaveLength(6);
    expect(plan.legs).toEqual([
      { distanceM: 2000, durationS: 300 },
      { distanceM: 3000, durationS: 400 },
    ]);
    expect(plan.steps).toEqual([
      { instruction: "Leave from Main St", distanceM: 1500, durationS: 200, location: [0, 0] },
      { instruction: "Take I-35E", distanceM: 3500, durationS: 500, location: [1, 0] },
      { instruction: "You have arrived", distanceM: 0, durationS: 0, location: [4, 0] },
    ]);
    expect(plan.notices).toEqual([
      { type: "violation", subtype: "truckRestriction", message: "Part of this route is not permitted for this truck", coordinates: [[3, 0], [4, 0]] },
      { type: "alert", subtype: "countryBorderCrossing", message: "Border crossing into CAN", coordinates: [[2, 0]] },
      { type: "alert", subtype: "toll", message: "Toll road", coordinates: [[1, 0], [2, 0]] },
    ]);
    expect(plan.incidents).toEqual([
      { id: "traffic-5", type: "congestion", description: "Traffic jam, +12 min", impact: "major", closed: false, location: [3, 0] },
      { id: "e9", type: "road_closure", description: "Road closed", impact: "critical", closed: true, location: [1, 0] },
    ]);
  });

  it("returns no routes when TomTom finds none", async () => {
    get.mockRejectedValue(new TomTomApiError(400, "NO_ROUTE_FOUND", "NO_ROUTE_FOUND: no valid route"));
    await expect(service.route({ coordinates: [[0, 0], [1, 1]] })).resolves.toEqual([]);
  });

  it("separates bad input from provider failures", async () => {
    get.mockRejectedValueOnce(new TomTomApiError(400, "BAD_INPUT", "Invalid coordinates"));
    await expect(service.route({ coordinates: [[0, 0], [1, 1]] })).rejects.toBeInstanceOf(BadRequestException);
    get.mockRejectedValueOnce(new TomTomApiError(429, undefined, "Over quota"));
    await expect(service.route({ coordinates: [[0, 0], [2, 2]] })).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("caches identical requests", async () => {
    const request = { coordinates: [[0, 0], [1, 1]] as LngLat[] };
    await service.route(request);
    await service.route(request);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("asks the truck matrix for travel times from one origin", async () => {
    post.mockResolvedValue({
      data: [
        { originIndex: 0, destinationIndex: 1, detailedError: { code: "CELL_PROCESSING_ERROR" } },
        { originIndex: 0, destinationIndex: 0, routeSummary: { lengthInMeters: 9000, travelTimeInSeconds: 600 } },
      ],
    });
    const estimates = await service.travelTimes([0, 0], [[1, 1], [2, 2]], { weightT: 20, heightM: 4 });

    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/routing/matrix/2");
    expect(body.origins).toEqual([{ point: { latitude: 0, longitude: 0 } }]);
    expect(body.options).toMatchObject({ travelMode: "truck", traffic: "live", departAt: "now", vehicleWeight: 20000, vehicleHeight: 4 });
    expect(estimates).toEqual([
      { durationS: 600, distanceM: 9000 },
      { durationS: null, distanceM: null },
    ]);
    expect(mapboxTimes).not.toHaveBeenCalled();
  });

  it("leaves the axle count out of the matrix, which TomTom rejects as an extraneous key", async () => {
    post.mockResolvedValue({ data: [] });
    await service.travelTimes([0, 0], [[1, 1]], { weightT: 36, axles: 5 });

    // The body as it goes over the wire, where undefined keys are dropped.
    const options = JSON.parse(JSON.stringify(post.mock.calls[0][1].options));
    expect(options).not.toHaveProperty("vehicleNumberOfAxles");
    expect(options).toMatchObject({ vehicleWeight: 36000, vehicleAxleWeight: 7200 });
  });

  it("falls back to Mapbox car times when TomTom refuses the matrix", async () => {
    post.mockRejectedValue(new TomTomApiError(429, undefined, "Over quota"));
    await expect(service.travelTimes([0, 0], [[1, 1]])).resolves.toEqual([{ durationS: 1, distanceM: 2 }]);
    expect(mapboxTimes).toHaveBeenCalledWith([0, 0], [[1, 1]]);
  });
});

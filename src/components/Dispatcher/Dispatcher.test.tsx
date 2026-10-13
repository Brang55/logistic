import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RoutePlan } from "../../app/api/routing";
import { json, mockApi, newStore, type ApiCall } from "../../test/api";
import { cargo, driver, routePlan, trailer, truck } from "../../test/fixtures";
import { formatDistance, formatDuration } from "../../utils/format";
import Dispatcher from "./Dispatcher";

// mapbox-gl needs WebGL, which jsdom doesn't have. The stub keeps the map's one job here: picking a load.
vi.mock("./DispatchMap", () => ({
  default: ({ cargos, onSelect }: { cargos: { id: string }[]; onSelect: (id: string) => void }) => (
    <div data-testid="map">
      {cargos.map((item) => (
        <button key={item.id} onClick={() => onSelect(item.id)}>
          Map pin {item.id}
        </button>
      ))}
    </div>
  ),
}));

const CARGOS = [
  cargo({ id: "cargo-1", pickupLocation: "Dallas, TX", deliveryLocation: "Atlanta, GA", shipperName: "Acme Paper" }),
  cargo({ id: "cargo-2", pickupLocation: "Chicago, IL", deliveryLocation: "Denver, CO", truckId: "truck-1", status: "picked_up" }),
  cargo({ id: "cargo-3", pickupLocation: "Phoenix, AZ", deliveryLocation: "Austin, TX", status: "delivered" }),
];
const TRUCKS = [
  truck({ id: "truck-1", truckNumber: "US-201", driverId: "driver-1" }),
  truck({ id: "truck-2", truckNumber: "US-202", driverId: "driver-2", trailerId: "trailer-2" }),
];
const DRIVERS = [
  driver({ id: "driver-1", firstName: "Jamie", lastName: "Carter", truckId: "truck-1", truckNumber: "US-201" }),
  driver({ id: "driver-2", firstName: "Maria", lastName: "Gonzalez", truckId: "truck-2", truckNumber: "US-202" }),
];
const TRAILERS = [trailer({ id: "trailer-2", trailerNumber: "TR-02", status: "taken" })];

const CLEAR = routePlan({ summary: "I-20 E" });
const RESTRICTED = routePlan({
  summary: "US-80 E",
  durationS: 39_000,
  distanceM: 1_190_000,
  notices: [
    { type: "violation", subtype: "height", message: "Low bridge on US-80" },
    { type: "violation", subtype: "weight", message: "Weight limit 20 t" },
    { type: "violation", subtype: "weight", message: "Weight limit 20 t" },
  ],
});

interface Fake {
  cargos?: () => Response;
  route?: (call: ApiCall) => Response;
}

/** The API behind the screen; each call gets a new Response, since a body can only be read once. */
const fakeApi = ({ cargos = () => json(200, CARGOS), route = () => routeWith([CLEAR]) }: Fake = {}) =>
  mockApi((call) => {
    if (call.path === "/api/cargos") return cargos();
    if (call.path === "/api/trucks") return json(200, TRUCKS);
    if (call.path === "/api/drivers") return json(200, DRIVERS);
    if (call.path === "/api/trailers") return json(200, TRAILERS);
    // Failing the first load means the live positions socket is never opened.
    if (call.path === "/api/positions/latest") return json(500, { statusCode: 500, message: "Not in tests" });
    if (/^\/api\/cargos\/[\w-]+\/truck-origins$/.test(call.path)) return json(200, []);
    if (/^\/api\/cargos\/[\w-]+\/route$/.test(call.path)) return route(call);
    if (/^\/api\/cargos\/[\w-]+\/assign$/.test(call.path)) return json(200, { id: call.path.split("/")[3] });
    return json(404, { statusCode: 404, message: `No fake for ${call.method} ${call.path}` });
  });

const routeWith = (routes: RoutePlan[]) =>
  json(200, { pickup: [-96.8, 32.78], delivery: [-84.39, 33.75], pickedUp: false, truck: null, routes });

const assignCalls = (calls: ApiCall[]) => calls.filter((call) => call.path.endsWith("/assign"));

const renderDispatcher = () =>
  render(
    <Provider store={newStore()}>
      <Dispatcher />
    </Provider>
  );

/** Opens a load's details card from its card in the queue. */
const selectLoad = async (route: string) => {
  fireEvent.click(await screen.findByText(route));
  return screen.findByRole("heading", { name: route });
};

const optionLabel = (plan: RoutePlan) => `${formatDuration(plan.durationS)} · ${formatDistance(plan.distanceM)}`;

describe("Dispatcher", () => {
  // jsdom has no layout, so no scrolling either; the screen scrolls the selected load into view.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists the active loads and leaves delivered ones out", async () => {
    fakeApi();
    renderDispatcher();

    expect(await screen.findByText("Dallas, TX → Atlanta, GA")).toBeInTheDocument();
    expect(screen.getByText("Chicago, IL → Denver, CO")).toBeInTheDocument();
    expect(screen.queryByText("Phoenix, AZ → Austin, TX")).toBeNull();
    expect(screen.getByText("2 active · 1 waiting for a truck")).toBeInTheDocument();
    // The assigned load shows its truck by number.
    expect(screen.getByText(/US-201/)).toBeInTheDocument();
  });

  it("says so when the loads can't be loaded", async () => {
    fakeApi({ cargos: () => json(500, { statusCode: 500, message: "Internal server error" }) });
    renderDispatcher();

    expect(await screen.findByText("There is an error")).toBeInTheDocument();
  });

  it("opens a load's details with its route options and restrictions", async () => {
    fakeApi({ route: () => routeWith([CLEAR, RESTRICTED]) });
    renderDispatcher();
    await selectLoad("Dallas, TX → Atlanta, GA");

    const clear = await screen.findByRole("button", { name: new RegExp(optionLabel(CLEAR)) });
    const restricted = screen.getByRole("button", { name: new RegExp(optionLabel(RESTRICTED)) });
    expect(clear).not.toHaveTextContent("Has truck restrictions");
    expect(restricted).toHaveTextContent("Has truck restrictions");
    // Nothing changed yet, so there is nothing to assign.
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();

    fireEvent.click(restricted);
    const list = screen.getByRole("heading", { name: "Truck restrictions on this route (3)" }).parentElement!;
    expect(within(list).getByText("Low bridge on US-80")).toBeInTheDocument();
    expect(within(list).getByText("Weight limit 20 t (2 places)")).toBeInTheDocument();
  });

  it("also opens a load picked on the map", async () => {
    fakeApi();
    renderDispatcher();
    fireEvent.click(await screen.findByText("Map pin cargo-2"));

    expect(await screen.findByRole("heading", { name: "Chicago, IL → Denver, CO" })).toBeInTheDocument();
    expect(screen.getByLabelText("Truck")).toHaveValue("truck-1");
  });

  it("assigns the picked truck, with its driver and trailer", async () => {
    const calls = fakeApi();
    renderDispatcher();
    await selectLoad("Dallas, TX → Atlanta, GA");

    fireEvent.change(screen.getByLabelText("Truck"), { target: { value: "truck-2" } });
    expect(screen.getByText("Driven by Maria Gonzalez")).toBeInTheDocument();
    expect(screen.getByLabelText("Trailer")).toHaveValue("trailer-2");
    // Wait for the route with this truck: until it is known the restrictions aren't either.
    await waitFor(() => expect(calls.filter((call) => call.path === "/api/cargos/cargo-1/route")).toHaveLength(2));
    await screen.findByRole("button", { name: new RegExp(optionLabel(CLEAR)) });

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(assignCalls(calls)).toHaveLength(1));
    expect(assignCalls(calls)[0]).toMatchObject({
      method: "POST",
      path: "/api/cargos/cargo-1/assign",
      body: { truckId: "truck-2", trailerId: "trailer-2" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks before assigning a truck whose route breaks restrictions", async () => {
    const calls = fakeApi({ route: () => routeWith([RESTRICTED]) });
    renderDispatcher();
    await selectLoad("Dallas, TX → Atlanta, GA");

    fireEvent.change(screen.getByLabelText("Truck"), { target: { value: "truck-2" } });
    await waitFor(() => expect(calls.filter((call) => call.path === "/api/cargos/cargo-1/route")).toHaveLength(2));
    await screen.findByRole("button", { name: new RegExp(optionLabel(RESTRICTED)) });

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    const dialog = await screen.findByRole("dialog", { name: "Truck restrictions on this route" });
    expect(dialog).toHaveTextContent("Low bridge on US-80");
    expect(assignCalls(calls)).toHaveLength(0);
  });

  it("shows the API's message when the route can't be calculated", async () => {
    fakeApi({ route: () => json(502, { statusCode: 502, message: "Routing service is unavailable" }) });
    renderDispatcher();
    await selectLoad("Dallas, TX → Atlanta, GA");

    expect(await screen.findByText("Routing service is unavailable")).toBeInTheDocument();
  });
});

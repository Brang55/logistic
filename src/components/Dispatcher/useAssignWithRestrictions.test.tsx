import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi, newStore, type ApiCall } from "../../test/api";
import { useAssignWithRestrictions } from "./useAssignWithRestrictions";

const DIALOG = "Truck restrictions on this route";

const Harness = ({ knownViolations }: { knownViolations?: string[] }) => {
  const { assign, dialog } = useAssignWithRestrictions();
  return (
    <>
      <button onClick={() => assign({ id: "cargo-1", truckId: "truck-1" }, knownViolations)}>Assign truck</button>
      {dialog}
    </>
  );
};

const renderHarness = (knownViolations?: string[]) =>
  render(
    <Provider store={newStore()}>
      <Harness knownViolations={knownViolations} />
    </Provider>
  );

// A fresh response each time: a body can only be read once.
const restricted = () =>
  json(409, {
    statusCode: 409,
    code: "ROUTE_RESTRICTIONS",
    message: "US-201's route breaks truck restrictions",
    violations: ["Vehicle is too heavy for this road", "Low bridge on I-35", "Vehicle is too heavy for this road"],
  });

const assignCalls = (calls: ApiCall[]) => calls.filter((call) => call.path === "/api/cargos/cargo-1/assign");

describe("useAssignWithRestrictions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("assigns straight away when the route has no restrictions", async () => {
    const calls = mockApi(() => json(200, { id: "cargo-1" }));
    renderHarness();
    fireEvent.click(screen.getByText("Assign truck"));

    await waitFor(() => expect(assignCalls(calls)).toHaveLength(1));
    expect(assignCalls(calls)[0].body).toEqual({ truckId: "truck-1" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists the restrictions and assigns only once the dispatcher accepts them", async () => {
    const calls = mockApi(({ body }) =>
      (body as { acceptRestrictions?: boolean }).acceptRestrictions ? json(200, { id: "cargo-1" }) : restricted()
    );
    renderHarness();
    fireEvent.click(screen.getByText("Assign truck"));

    const dialog = await screen.findByRole("dialog", { name: DIALOG });
    expect(dialog).toHaveTextContent("Vehicle is too heavy for this road (2 places)");
    expect(dialog).toHaveTextContent("Low bridge on I-35");

    fireEvent.click(screen.getByText("Assign anyway"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(assignCalls(calls).map((call) => call.body)).toEqual([
      { truckId: "truck-1" },
      { truckId: "truck-1", acceptRestrictions: true },
    ]);
  });

  it("keeps the load unassigned when the dispatcher cancels", async () => {
    const calls = mockApi(restricted);
    renderHarness();
    fireEvent.click(screen.getByText("Assign truck"));
    await screen.findByRole("dialog", { name: DIALOG });

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(assignCalls(calls)).toHaveLength(1);
  });

  it("asks without calling the API when the restrictions are already known", async () => {
    const calls = mockApi(() => json(200, { id: "cargo-1" }));
    renderHarness(["Vehicle is 0.2 m too tall"]);
    fireEvent.click(screen.getByText("Assign truck"));

    expect(await screen.findByRole("dialog", { name: DIALOG })).toHaveTextContent("Vehicle is 0.2 m too tall");
    expect(calls).toHaveLength(0);
  });

  it("shows the API's error in the dialog when accepting fails", async () => {
    mockApi(({ body }) =>
      (body as { acceptRestrictions?: boolean }).acceptRestrictions
        ? json(403, { statusCode: 403, message: "Forbidden resource" })
        : restricted()
    );
    renderHarness();
    fireEvent.click(screen.getByText("Assign truck"));
    await screen.findByRole("dialog", { name: DIALOG });

    fireEvent.click(screen.getByText("Assign anyway"));
    expect(await screen.findByText("Forbidden resource")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: DIALOG })).toBeInTheDocument();
  });

  it("doesn't ask about restrictions for other failures", async () => {
    const calls = mockApi(() => json(404, { statusCode: 404, message: "Cargo not found" }));
    renderHarness();
    fireEvent.click(screen.getByText("Assign truck"));

    await waitFor(() => expect(assignCalls(calls)).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

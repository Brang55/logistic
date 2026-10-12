import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import ReplyText from "./ReplyText";

const TABLE = `Two trucks are late.

| Truck | Load | Delay |
| --- | --- | --- |
| US-202 | Dallas → Chicago | 40 min |
| US-205 | Atlanta → Orlando | 15 min |
`;

describe("ReplyText", () => {
  it("labels each table cell with its column header, for the phone card layout", () => {
    render(
      <MemoryRouter>
        <ReplyText text={TABLE} />
      </MemoryRouter>
    );

    expect(screen.getByText("US-202")).toHaveAttribute("data-label", "Truck");
    expect(screen.getByText("Atlanta → Orlando")).toHaveAttribute("data-label", "Load");
    expect(screen.getByText("15 min")).toHaveAttribute("data-label", "Delay");
  });
});

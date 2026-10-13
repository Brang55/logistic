import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../contexts/AuthContext";
import { json, mockApi, newStore } from "../../test/api";
import Navigation from "./Navigation";

const renderNavigation = () =>
  render(
    <Provider store={newStore()}>
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: { id: "user-1", email: "dispatch@example.com", role: "dispatcher" },
            loading: false,
            logoutUser: vi.fn(),
          }}
        >
          <Navigation />
        </AuthContext.Provider>
      </MemoryRouter>
    </Provider>
  );

const assistantButton = () => screen.queryByRole("button", { name: /^Ask the assistant/ });

describe("Navigation", () => {
  afterEach(() => vi.unstubAllGlobals());

  // On phones the open menu reaches the bottom-right corner, where the assistant button floats over Log out.
  it("hides the assistant button while the phone menu is open, so Log out can be tapped", () => {
    mockApi(() => json(200, {}));
    renderNavigation();
    expect(assistantButton()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(assistantButton()).toBeNull();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(assistantButton()).toBeInTheDocument();
  });
});

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../app/api/auth";
import { AuthContext } from "../../contexts/AuthContext";
import { json, mockApi, newStore } from "../../test/api";
import Navigation from "./Navigation";

const DISPATCHER: AuthUser = { id: "user-1", email: "dispatch@example.com", role: "dispatcher" };
const DRIVER: AuthUser = { id: "user-2", email: "driver@example.com", role: "driver" };

// Buttons to log in and out stand in for the login page and the API.
const Harness = () => {
  const [user, setUser] = useState<AuthUser | null>(DISPATCHER);
  return (
    <AuthContext.Provider value={{ user, loading: false, logoutUser: vi.fn() }}>
      <button onClick={() => setUser(null)}>Test: log out</button>
      <button onClick={() => setUser(DRIVER)}>Test: log in as driver</button>
      <button onClick={() => setUser(DISPATCHER)}>Test: log in as dispatcher</button>
      <Navigation />
    </AuthContext.Provider>
  );
};

const renderNavigation = () =>
  render(
    <Provider store={newStore()}>
      <MemoryRouter>
        <Harness />
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

  // Logging out from the open phone menu used to leave it open for the next login, and the page unscrollable.
  it.each([
    ["another user", "Test: log in as driver"],
    ["the same user", "Test: log in as dispatcher"],
  ])("starts with the phone menu closed when %s logs in", (_who, logIn) => {
    mockApi(() => json(200, {}));
    renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.documentElement.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Test: log out" }));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");

    fireEvent.click(screen.getByRole("button", { name: logIn }));
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
    expect(document.documentElement.style.overflow).toBe("");
  });
});

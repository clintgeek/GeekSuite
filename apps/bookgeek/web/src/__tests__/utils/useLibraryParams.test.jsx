import React from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LibraryParamsProvider, useLibraryParams } from "../../hooks/useLibraryParams";
import { RouterProbe } from "../appHarness";

function Controls() {
  const p = useLibraryParams();
  return (
    <>
      <span data-testid="state">{`${ p.activeView }|${ p.shelfFilter }|${ p.searchQuery }|${ p.tagFilter }`}</span>
      {/* "Clear filters" is four setter calls in one handler. */}
      <button
        onClick={() => {
          p.setSearchQuery("");
          p.setAuthorFilter("");
          p.setTagFilter("");
          p.setShelfFilter("all");
        }}
      >
        clear
      </button>
      {/* A sidebar shelf row: a shelf AND "go to the library". */}
      <button
        onClick={() => {
          p.setShelfFilter("read");
          p.setActiveView("library");
        }}
      >
        shelf
      </button>
      <button onClick={() => p.setActiveView("profile")}>settings</button>
      <input aria-label="search" value={p.searchQuery} onChange={(e) => p.setSearchQuery(e.target.value)} />
    </>
  );
}

function renderAt(url) {
  const router = {};
  render(
    <MemoryRouter initialEntries={[url]}>
      <RouterProbe into={router} />
      <LibraryParamsProvider>
        <Controls />
      </LibraryParamsProvider>
    </MemoryRouter>
  );
  return router;
}

describe("useLibraryParams", () => {
  it("several setters in one handler land in ONE navigation, none lost", async () => {
    const router = renderAt("/?q=dune&tag=sf&shelf=reading");
    await act(async () => screen.getByText("clear").click());
    expect(router.location.pathname).toBe("/");
    expect(router.location.search).toBe("");
    expect(screen.getByTestId("state").textContent).toBe("library|all||");
  });

  it("a shelf row from Settings sets the shelf and returns to the library", async () => {
    const router = renderAt("/settings?q=dune");
    expect(screen.getByTestId("state").textContent).toBe("profile|all|dune|");
    await act(async () => screen.getByText("shelf").click());
    expect(router.location.pathname).toBe("/");
    expect(router.location.search).toBe("?q=dune&shelf=read");
  });

  it("the same shelf row over an open book keeps the sheet's path", async () => {
    const router = renderAt("/book/b1");
    await act(async () => screen.getByText("shelf").click());
    expect(router.location.pathname).toBe("/book/b1");
    expect(router.location.search).toBe("?shelf=read");
  });

  it("Settings is a pushed path that keeps the filters", async () => {
    const router = renderAt("/?shelf=read");
    await act(async () => screen.getByText("settings").click());
    expect(router.location.pathname).toBe("/settings");
    expect(router.location.search).toBe("?shelf=read");
    await act(async () => router.navigate(-1));
    expect(router.location.pathname).toBe("/");
  });

  it("the search box types normally (controlled from state, mirrored to ?q=)", async () => {
    const router = renderAt("/?shelf=read");
    const box = screen.getByLabelText("search");
    await userEvent.type(box, "dune");
    expect(box).toHaveValue("dune");
    expect(router.location.search).toBe("?shelf=read&q=dune");
    // (The caret-jump this state exists for is browser-only: jsdom passes
    // with or without it, so it is not asserted here.)
    // …and the URL moving on its own (Back) moves the box.
    await act(async () => router.navigate("/?q=other"));
    expect(box).toHaveValue("other");
  });
});

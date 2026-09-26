import React from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { LibraryParamsProvider, useLibraryParams } from "../../hooks/useLibraryParams";
import { RouterProbe } from "../appHarness";

function Controls() {
  const p = useLibraryParams();
  const f = p.lib.state.filter;
  return (
    <>
      <span data-testid="state">{`${ p.activeView }|${ p.shelfFilter }|${ p.searchQuery }|${ f.tags.join(",") }`}</span>
      {/* "Clear filters": every narrowing off in one navigation. */}
      <button onClick={() => p.lib.clearAll()}>clear</button>
      {/* A sidebar / strip shelf row. */}
      <button onClick={() => p.showShelf("read")}>shelf</button>
      <button onClick={() => p.showShelf("all")}>all</button>
      <button onClick={() => p.lib.toggle("shelves", "abandoned")}>also abandoned</button>
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
  it("Clear all drops every filter in ONE navigation, sort kept", async () => {
    const router = renderAt("/?q=dune&tag=sf&shelf=reading&sort=author");
    expect(screen.getByTestId("state").textContent).toBe("library|reading|dune|sf");
    await act(async () => screen.getByText("clear").click());
    expect(router.location.pathname).toBe("/");
    expect(router.location.search).toBe("?sort=author");
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

  it("a shelf row replaces the shelves and keeps the other filters; All clears only the shelf", async () => {
    const router = renderAt("/?shelf=reading&shelf=unread&tag=sf");
    expect(screen.getByTestId("state").textContent).toBe("library|null||sf");
    await act(async () => screen.getByText("shelf").click());
    expect(router.location.search).toBe("?shelf=read&tag=sf");
    await act(async () => screen.getByText("all").click());
    expect(router.location.search).toBe("?tag=sf");
  });

  it("the panel's shelf checkbox adds a shelf, as a repeated param", async () => {
    const router = renderAt("/?shelf=read");
    await act(async () => screen.getByText("also abandoned").click());
    expect(router.location.search).toBe("?shelf=read&shelf=abandoned");
    expect(screen.getByTestId("state").textContent).toBe("library|null||");
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
    expect(router.location.search).toBe("?q=dune&shelf=read");
    // …and the URL moving on its own (Back, a saved view) moves the box.
    await act(async () => router.navigate("/?q=other"));
    expect(box).toHaveValue("other");
  });
});

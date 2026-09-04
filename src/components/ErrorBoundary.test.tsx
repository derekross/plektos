/**
 * The boundary only earns its place if it catches, recovers, and — the part
 * that is easy to get wrong — never puts a stack trace on screen.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ throws }: { throws: boolean }): React.ReactElement {
  if (throws) {
    const err = new Error("kaboom");
    err.stack = "Error: kaboom\n    at secretFunction (/home/user/.nsec-material)";
    throw err;
  }
  return <p>all good</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error itself, and so does componentDidCatch. Both
    // are correct; neither belongs in the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom throws={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeDefined();
  });

  it("catches a render throw instead of unmounting the tree", () => {
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("shows the message but never the stack", () => {
    const { container } = render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>,
    );
    expect(screen.getByText("kaboom")).toBeDefined();
    // The guard that matters: a decrypt failure on a private route can carry
    // key material in its stack, and this dialog is what people screenshot.
    expect(container.textContent).not.toContain("secretFunction");
    expect(container.textContent).not.toContain(".nsec-material");
  });

  it("recovers when the child stops throwing", () => {
    function Harness() {
      const [throws, setThrows] = React.useState(true);
      return (
        <>
          <button onClick={() => setThrows(false)}>fix it</button>
          <ErrorBoundary>
            <Boom throws={throws} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByText("Something went wrong")).toBeDefined();

    // Flipping the prop alone is not enough — a boundary latches until reset,
    // which is exactly why the router-level one is keyed on the pathname.
    fireEvent.click(screen.getByText("fix it"));
    fireEvent.click(screen.getByText("Try again"));
    expect(screen.getByText("all good")).toBeDefined();
  });

  it("uses a custom fallback when given one", () => {
    render(
      <ErrorBoundary fallback={(err) => <p>custom: {err.message}</p>}>
        <Boom throws />
      </ErrorBoundary>,
    );
    expect(screen.getByText("custom: kaboom")).toBeDefined();
  });
});

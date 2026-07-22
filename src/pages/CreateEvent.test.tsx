import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestApp } from "@/test/TestApp";
import { CreateEvent } from "./CreateEvent";

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    user: {
      pubkey:
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      signer: {},
    },
  }),
}));

describe("CreateEvent — vibe-first flow", () => {
  it("opens on the vibe step with the live poster preview", () => {
    render(
      <TestApp>
        <CreateEvent />
      </TestApp>,
    );

    expect(screen.getByText("Throw a party")).toBeInTheDocument();
    expect(screen.getByTestId("poster-preview")).toBeInTheDocument();
    expect(screen.getByText("Quick vibes")).toBeInTheDocument();
    expect(screen.getByText("Poster font")).toBeInTheDocument();
    expect(screen.getByText("Ambient effect")).toBeInTheDocument();
    // Details live on step 2
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
  });

  it("keeps Next disabled until a title is typed, then advances to details", () => {
    render(
      <TestApp>
        <CreateEvent />
      </TestApp>,
    );

    const next = screen.getByRole("button", { name: /next: the details/i });
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/what's the party called/i), {
      target: { value: "Rooftop Solstice Rave" },
    });
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /publish party/i }),
    ).toBeInTheDocument();
  });

  it("types the title straight onto the live poster", () => {
    render(
      <TestApp>
        <CreateEvent />
      </TestApp>,
    );

    fireEvent.change(screen.getByLabelText(/what's the party called/i), {
      target: { value: "Satoshi's Birthday" },
    });
    expect(screen.getByText("Satoshi's Birthday")).toBeInTheDocument();
  });

  it("returns to the vibe step from details", () => {
    render(
      <TestApp>
        <CreateEvent />
      </TestApp>,
    );

    fireEvent.change(screen.getByLabelText(/what's the party called/i), {
      target: { value: "Taco Tuesday" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next: the details/i }));
    fireEvent.click(screen.getByRole("button", { name: /back to the vibe/i }));
    expect(screen.getByTestId("poster-preview")).toBeInTheDocument();
  });
});

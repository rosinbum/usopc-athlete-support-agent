import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminError from "./error.js";

describe("AdminError", () => {
  it("renders the error message", () => {
    const error = new Error("Something exploded");
    render(<AdminError error={error} reset={vi.fn()} />);
    expect(
      screen.getByText("Something went wrong in the admin panel"),
    ).toBeInTheDocument();
    expect(screen.getByText("Something exploded")).toBeInTheDocument();
  });

  it("renders the Try again button", () => {
    const error = new Error("Oops");
    render(<AdminError error={error} reset={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("calls reset when Try again is clicked", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const error = new Error("Network failure");
    render(<AdminError error={error} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledOnce();
  });

  it("renders with an error that has a digest", () => {
    const error = Object.assign(new Error("Digest error"), {
      digest: "abc123",
    });
    render(<AdminError error={error} reset={vi.fn()} />);
    expect(screen.getByText("Digest error")).toBeInTheDocument();
  });
});

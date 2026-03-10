import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccessRequestForm } from "./AccessRequestForm.js";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("AccessRequestForm", () => {
  it("renders name, email, sport, role fields and submit button", () => {
    render(<AccessRequestForm />);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sport/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /submit request/i }),
    ).toBeInTheDocument();
  });

  it("shows success message after successful submission", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "created" }),
    } as Response);

    render(<AccessRequestForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/email/i), "jane@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: /submit request/i }),
    );

    expect(await screen.findByText(/request submitted/i)).toBeInTheDocument();
  });

  it("shows already-requested message for duplicate", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "already_requested" }),
    } as Response);

    render(<AccessRequestForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/email/i), "jane@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: /submit request/i }),
    );

    expect(await screen.findByText(/already requested/i)).toBeInTheDocument();
  });

  it("shows error message on API failure", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    } as Response);

    render(<AccessRequestForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/email/i), "jane@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: /submit request/i }),
    );

    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
  });

  it("shows network error on fetch failure", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

    render(<AccessRequestForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/email/i), "jane@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: /submit request/i }),
    );

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });

  it("disables button while submitting", async () => {
    let resolvePromise: (value: Response) => void;
    vi.mocked(global.fetch).mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(<AccessRequestForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await userEvent.type(screen.getByLabelText(/email/i), "jane@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: /submit request/i }),
    );

    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();

    // Clean up
    resolvePromise!({
      ok: true,
      json: () => Promise.resolve({ status: "created" }),
    } as Response);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateSourceForm } from "./CreateSourceForm.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = { href: "" };
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreateSourceForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.href = "";
  });

  it("renders all form fields", () => {
    render(<CreateSourceForm />);

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/document type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/authority level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^priority/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ngb id/i)).toBeInTheDocument();
    expect(screen.getByText(/topic domains/i)).toBeInTheDocument();
  });

  it("auto-generates ID from title", async () => {
    render(<CreateSourceForm />);

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.type(titleInput, "USOPC Bylaws");

    const idInput = screen.getByLabelText(/^id/i) as HTMLInputElement;
    expect(idInput.value).toBe("usopc-bylaws");
  });

  it("shows validation errors for missing required fields", async () => {
    render(<CreateSourceForm />);

    fireEvent.click(screen.getByRole("button", { name: /create source/i }));

    await waitFor(() => {
      expect(screen.getByText("ID is required")).toBeInTheDocument();
      expect(screen.getByText("Title is required")).toBeInTheDocument();
      expect(screen.getByText("Description is required")).toBeInTheDocument();
      expect(screen.getByText("URL is required")).toBeInTheDocument();
      expect(
        screen.getByText("At least one topic domain is required"),
      ).toBeInTheDocument();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid URL", async () => {
    render(<CreateSourceForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "Test");
    await userEvent.type(screen.getByLabelText(/description/i), "A test");
    await userEvent.type(screen.getByLabelText(/url/i), "not-a-url");
    fireEvent.click(screen.getByText("Governance"));

    fireEvent.click(screen.getByRole("button", { name: /create source/i }));

    await waitFor(() => {
      expect(screen.getByText("Must be a valid URL")).toBeInTheDocument();
    });
  });

  it("submits form and redirects on success", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: () =>
        Promise.resolve({
          source: { id: "test-source", title: "Test Source" },
        }),
    });

    render(<CreateSourceForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "Test Source");
    await userEvent.type(
      screen.getByLabelText(/description/i),
      "A description",
    );
    await userEvent.type(
      screen.getByLabelText(/url/i),
      "https://example.com/doc.pdf",
    );
    fireEvent.click(screen.getByText("Governance"));

    fireEvent.click(screen.getByRole("button", { name: /create source/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"id":"test-source"'),
      });
    });

    expect(mockLocation.href).toBe("/admin/sources");
  });

  it("shows error message on 409 conflict", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 409,
      ok: false,
      json: () =>
        Promise.resolve({ error: "A source with this ID already exists" }),
    });

    render(<CreateSourceForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "Test");
    await userEvent.type(screen.getByLabelText(/description/i), "Desc");
    await userEvent.type(
      screen.getByLabelText(/url/i),
      "https://example.com/doc.pdf",
    );
    fireEvent.click(screen.getByText("Governance"));

    fireEvent.click(screen.getByRole("button", { name: /create source/i }));

    await waitFor(() => {
      expect(
        screen.getByText("A source with this ID already exists"),
      ).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: () => Promise.resolve({ error: "Internal server error" }),
    });

    render(<CreateSourceForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "Test");
    await userEvent.type(screen.getByLabelText(/description/i), "Desc");
    await userEvent.type(
      screen.getByLabelText(/url/i),
      "https://example.com/doc.pdf",
    );
    fireEvent.click(screen.getByText("Governance"));

    fireEvent.click(screen.getByRole("button", { name: /create source/i }));

    await waitFor(() => {
      expect(screen.getByText("Internal server error")).toBeInTheDocument();
    });
  });
});

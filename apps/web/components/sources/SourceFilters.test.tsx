import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourceFilters } from "./SourceFilters.js";

const mockOrganizations = [
  { id: "usa_swimming", name: "USA Swimming" },
  { id: "usa_track_field", name: "USA Track & Field" },
];

describe("SourceFilters", () => {
  it("renders search input", () => {
    render(<SourceFilters filters={{}} onFilterChange={() => {}} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("renders document type dropdown", () => {
    render(<SourceFilters filters={{}} onFilterChange={() => {}} />);
    expect(screen.getByLabelText(/document type/i)).toBeInTheDocument();
  });

  it("renders topic domain dropdown", () => {
    render(<SourceFilters filters={{}} onFilterChange={() => {}} />);
    expect(screen.getByLabelText(/topic/i)).toBeInTheDocument();
  });

  it("renders organization dropdown", () => {
    render(<SourceFilters filters={{}} onFilterChange={() => {}} />);
    expect(screen.getByLabelText(/organization/i)).toBeInTheDocument();
  });

  it("calls onFilterChange when search changes", () => {
    const handleChange = vi.fn();
    render(<SourceFilters filters={{}} onFilterChange={handleChange} />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: "bylaws" } });

    expect(handleChange).toHaveBeenCalledWith({ search: "bylaws" });
  });

  it("calls onFilterChange when document type changes", () => {
    const handleChange = vi.fn();
    render(<SourceFilters filters={{}} onFilterChange={handleChange} />);

    const select = screen.getByLabelText(/document type/i);
    fireEvent.change(select, { target: { value: "policy" } });

    expect(handleChange).toHaveBeenCalledWith({ documentType: "policy" });
  });

  it("calls onFilterChange when topic domain changes", () => {
    const handleChange = vi.fn();
    render(<SourceFilters filters={{}} onFilterChange={handleChange} />);

    const select = screen.getByLabelText(/topic/i);
    fireEvent.change(select, { target: { value: "safesport" } });

    expect(handleChange).toHaveBeenCalledWith({ topicDomain: "safesport" });
  });

  it("calls onFilterChange when organization changes", () => {
    const handleChange = vi.fn();
    render(
      <SourceFilters
        filters={{}}
        onFilterChange={handleChange}
        organizations={mockOrganizations}
      />,
    );

    const select = screen.getByLabelText(/organization/i);
    fireEvent.change(select, { target: { value: "usa_swimming" } });

    expect(handleChange).toHaveBeenCalledWith({ ngbId: "usa_swimming" });
  });

  it("displays current filter values", () => {
    render(
      <SourceFilters
        filters={{
          search: "bylaws",
          documentType: "policy",
          topicDomain: "safesport",
          ngbId: "usa_swimming",
        }}
        onFilterChange={() => {}}
        organizations={mockOrganizations}
      />,
    );

    expect(screen.getByPlaceholderText(/search/i)).toHaveValue("bylaws");
    expect(screen.getByLabelText(/document type/i)).toHaveValue("policy");
    expect(screen.getByLabelText(/topic/i)).toHaveValue("safesport");
    expect(screen.getByLabelText(/organization/i)).toHaveValue("usa_swimming");
  });
});

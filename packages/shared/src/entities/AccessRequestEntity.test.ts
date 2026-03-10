import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

import { AccessRequestEntity } from "./AccessRequestEntity.js";

function createMockTable() {
  const mockModel = {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    scan: vi.fn(),
  };
  const table = {
    getModel: vi.fn().mockReturnValue(mockModel),
  };
  return { table, mockModel };
}

describe("AccessRequestEntity", () => {
  let entity: AccessRequestEntity;
  let mockModel: ReturnType<typeof createMockTable>["mockModel"];

  beforeEach(() => {
    vi.clearAllMocks();
    const { table, mockModel: m } = createMockTable();
    mockModel = m;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entity = new AccessRequestEntity(table as any);
  });

  describe("get", () => {
    it("returns null when not found", async () => {
      mockModel.get.mockResolvedValue(null);
      const result = await entity.get("test@example.com");
      expect(result).toBeNull();
    });

    it("returns the access request when found", async () => {
      mockModel.get.mockResolvedValue({
        email: "test@example.com",
        name: "Jane Doe",
        status: "pending",
        requestedAt: "2026-01-01T00:00:00.000Z",
      });

      const result = await entity.get("test@example.com");
      expect(result).toEqual({
        email: "test@example.com",
        name: "Jane Doe",
        sport: undefined,
        role: undefined,
        status: "pending",
        requestedAt: "2026-01-01T00:00:00.000Z",
        reviewedAt: undefined,
        reviewedBy: undefined,
      });
    });
  });

  describe("create", () => {
    it("creates an access request with required fields", async () => {
      mockModel.create.mockImplementation((item: Record<string, unknown>) =>
        Promise.resolve(item),
      );

      const result = await entity.create({
        email: "Jane@Example.COM",
        name: "Jane Doe",
      });

      expect(result.email).toBe("jane@example.com");
      expect(result.name).toBe("Jane Doe");
      expect(result.status).toBe("pending");
      expect(result.requestedAt).toBeDefined();
    });

    it("includes optional sport and role", async () => {
      mockModel.create.mockImplementation((item: Record<string, unknown>) =>
        Promise.resolve(item),
      );

      const result = await entity.create({
        email: "test@example.com",
        name: "John",
        sport: "Swimming",
        role: "Athlete",
      });

      expect(result.sport).toBe("Swimming");
      expect(result.role).toBe("Athlete");
    });
  });

  describe("updateStatus", () => {
    it("updates the status and reviewedAt", async () => {
      mockModel.update.mockResolvedValue({
        email: "test@example.com",
        name: "Jane",
        status: "approved",
        requestedAt: "2026-01-01T00:00:00.000Z",
        reviewedAt: "2026-01-02T00:00:00.000Z",
        reviewedBy: "admin@example.com",
      });

      const result = await entity.updateStatus(
        "test@example.com",
        "approved",
        "admin@example.com",
      );

      expect(result?.status).toBe("approved");
      expect(result?.reviewedBy).toBe("admin@example.com");
      expect(mockModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          status: "approved",
          reviewedBy: "admin@example.com",
        }),
      );
    });
  });

  describe("getAll", () => {
    it("returns all access requests", async () => {
      mockModel.scan.mockResolvedValue([
        {
          email: "a@example.com",
          name: "A",
          status: "pending",
          requestedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          email: "b@example.com",
          name: "B",
          status: "approved",
          requestedAt: "2026-01-02T00:00:00.000Z",
        },
      ]);

      const results = await entity.getAll();
      expect(results).toHaveLength(2);
      expect(results[0]!.email).toBe("a@example.com");
      expect(results[1]!.status).toBe("approved");
    });
  });
});

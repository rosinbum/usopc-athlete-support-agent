import { describe, it, expect } from "vitest";
import { ParamBuilder } from "./paramBuilder.js";

describe("ParamBuilder", () => {
  it("returns $1 for the first added value", () => {
    const p = new ParamBuilder();
    expect(p.add("hello")).toBe("$1");
  });

  it("increments the placeholder index on each add()", () => {
    const p = new ParamBuilder();
    expect(p.add("a")).toBe("$1");
    expect(p.add("b")).toBe("$2");
    expect(p.add("c")).toBe("$3");
  });

  it("values() returns params in insertion order", () => {
    const p = new ParamBuilder();
    p.add("first");
    p.add(42);
    p.add(null);
    expect(p.values()).toEqual(["first", 42, null]);
  });

  it("values() returns a copy — mutations do not affect internal state", () => {
    const p = new ParamBuilder();
    p.add("x");
    const v = p.values();
    v.push("injected");
    expect(p.values()).toHaveLength(1);
  });

  it("length reflects the current param count", () => {
    const p = new ParamBuilder();
    expect(p.length).toBe(0);
    p.add("a");
    expect(p.length).toBe(1);
    p.add("b");
    expect(p.length).toBe(2);
  });

  it("handles mixed types (string, number, boolean, null, object)", () => {
    const p = new ParamBuilder();
    const ref1 = p.add("str");
    const ref2 = p.add(99);
    const ref3 = p.add(true);
    const ref4 = p.add(null);
    const ref5 = p.add({ key: "val" });

    expect([ref1, ref2, ref3, ref4, ref5]).toEqual([
      "$1",
      "$2",
      "$3",
      "$4",
      "$5",
    ]);
    expect(p.values()).toEqual(["str", 99, true, null, { key: "val" }]);
  });

  it("calling values() multiple times returns the same params", () => {
    const p = new ParamBuilder();
    p.add("a");
    p.add("b");
    expect(p.values()).toEqual(p.values());
  });

  it("supports building a SQL WHERE clause with correct placeholders", () => {
    const p = new ParamBuilder();
    const conditions: string[] = [];

    const search = "athlete";
    conditions.push(`document_title ILIKE ${p.add(`%${search}%`)}`);
    conditions.push(`document_type = ${p.add("policy")}`);

    const limitRef = p.add(20);
    const offsetRef = p.add(0);

    const sql = `SELECT * FROM t WHERE ${conditions.join(" AND ")} LIMIT ${limitRef} OFFSET ${offsetRef}`;

    expect(sql).toBe(
      "SELECT * FROM t WHERE document_title ILIKE $1 AND document_type = $2 LIMIT $3 OFFSET $4",
    );
    expect(p.values()).toEqual(["%athlete%", "policy", 20, 0]);
  });

  it("snapshot via values() does not include params added after the snapshot", () => {
    const p = new ParamBuilder();
    p.add("filter");
    const filterValues = p.values(); // snapshot: ["filter"]

    p.add(10); // limit
    p.add(0); // offset

    // filterValues is a snapshot — only 1 element
    expect(filterValues).toEqual(["filter"]);
    // full values include all three
    expect(p.values()).toEqual(["filter", 10, 0]);
  });
});

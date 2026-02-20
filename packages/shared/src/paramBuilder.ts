// ---------------------------------------------------------------------------
// ParamBuilder — safe positional SQL parameter accumulator
// ---------------------------------------------------------------------------
//
// Builds a list of query parameters and returns the correct `$N` placeholder
// on each call to `add()`. This eliminates the fragile "params.length + offset"
// arithmetic that silently breaks when the fixed-param count changes.
//
// Usage:
//   const p = new ParamBuilder();
//   const sql = `SELECT * FROM t WHERE a = ${p.add(1)} AND b = ${p.add(2)}`;
//   pool.query(sql, p.values()); // params: [1, 2]

export class ParamBuilder {
  private readonly params: unknown[] = [];

  /**
   * Appends `val` to the parameter list and returns the corresponding
   * PostgreSQL positional placeholder (`$1`, `$2`, …).
   */
  add(val: unknown): string {
    this.params.push(val);
    return `$${this.params.length}`;
  }

  /**
   * Returns the accumulated parameter array in insertion order.
   * Pass this directly to `pool.query(sql, p.values())`.
   */
  values(): unknown[] {
    return [...this.params];
  }

  /**
   * Returns the current parameter count (i.e. the index of the last param
   * that was added, or 0 if none have been added yet).
   */
  get length(): number {
    return this.params.length;
  }
}

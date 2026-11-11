// Phase 8 — ONE definition of "collapse repeated audit rows" (was private to AuditBox).
// Consecutive rows with the same key become one line "×N, first → last". Nothing is hidden: the
// count and the time span are kept, and the CSV downloads still contain every row.

export type Collapsed<T> = { first: T; last: T; count: number; rows: T[] };

export function collapseRepeats<T>(rows: T[], keyOf: (r: T) => string): Collapsed<T>[] {
  const out: Collapsed<T>[] = [];
  let prevKey: string | null = null;
  for (const r of rows) {
    const k = keyOf(r);
    const prev = out[out.length - 1];
    if (prev && k === prevKey) {
      prev.count += 1;
      prev.last = r;
      prev.rows.push(r);
    } else {
      out.push({ first: r, last: r, count: 1, rows: [r] });
    }
    prevKey = k;
  }
  return out;
}

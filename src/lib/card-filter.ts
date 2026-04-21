// ─────────────────────────────────────────────────────────────────────
// card-filter.ts — pure helpers for building Boxel Query objects from
// CLI flags. Extracted from `boxel card search` so the logic is unit
// testable without touching the HTTP layer.
//
// Boxel's query language (packages/runtime-common/query.ts):
//   CardTypeFilter: {type: CodeRef}
//   EqFilter:       {on?: CodeRef, eq: {field: JSONValue}}
//   InFilter:       {on?: CodeRef, in: {field: JSONValue[]}}
//   ContainsFilter: {on?: CodeRef, contains: {field: JSONValue}}
//   RangeFilter:    {on?: CodeRef, range: {field: {gt?, gte?, lt?, lte?}}}
//   NotFilter:      {not: Filter}
//   AnyFilter:      {any: Filter[]}
//   EveryFilter:    {every: Filter[]}
//
// This module composes multiple flag-sourced filter clauses into an
// EveryFilter (when more than one) or returns the single clause.
// ─────────────────────────────────────────────────────────────────────

export type CodeRef = { module: string; name: string };

/**
 * Parse a value string. Tries JSON first (handles 42, true, null, "quoted"),
 * falls back to raw string. Mirrors curl's `-d` semantic for key=value
 * parameters: numbers and booleans "just work", strings don't need quoting.
 */
export function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Parse repeatable `key=value` flag inputs. First `=` is the separator
 * (value may contain further `=`). Empty input returns empty object.
 */
export function parseKV(items: string[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of items ?? []) {
    const idx = s.indexOf('=');
    if (idx < 0) {
      throw new Error(`Expected key=value, got: ${s}`);
    }
    out[s.slice(0, idx)] = parseValue(s.slice(idx + 1));
  }
  return out;
}

/**
 * Parse a CodeRef of the form `module-url#Name`. Splits on the LAST
 * `#` so module URLs containing `#` (fragments) survive.
 */
export function parseCodeRef(raw: string): CodeRef {
  const hash = raw.lastIndexOf('#');
  if (hash < 0) {
    throw new Error(`Expected '<module-url>#<Name>', got: ${raw}`);
  }
  const module = raw.slice(0, hash);
  const name = raw.slice(hash + 1);
  if (!module || !name) {
    throw new Error(`Expected '<module-url>#<Name>', got: ${raw}`);
  }
  return { module, name };
}

export interface FilterFlags {
  type?: string;
  on?: string;
  eq?: string[];
  in?: string[];
  contains?: string[];
  gt?: string[];
  gte?: string[];
  lt?: string[];
  lte?: string[];
}

/**
 * Compose a Boxel Filter from flag inputs. Returns undefined when no
 * flags are set (caller may supply the filter from a file/stdin).
 *
 * Semantics:
 * - `--type` emits a standalone CardTypeFilter clause.
 * - `--on` scopes eq/in/contains/range clauses to a type.
 * - Multiple clauses are AND-ed via EveryFilter.
 * - A single clause is returned as-is (no EveryFilter wrapping).
 */
export function buildFilterFromFlags(flags: FilterFlags): any | undefined {
  const clauses: any[] = [];
  const on = flags.on ? parseCodeRef(flags.on) : undefined;

  if (flags.type) {
    clauses.push({ type: parseCodeRef(flags.type) });
  }

  const eq = parseKV(flags.eq);
  if (Object.keys(eq).length) {
    clauses.push(on ? { on, eq } : { eq });
  }

  const contains = parseKV(flags.contains);
  if (Object.keys(contains).length) {
    clauses.push(on ? { on, contains } : { contains });
  }

  if (flags.in?.length) {
    const inObj: Record<string, unknown[]> = {};
    for (const s of flags.in) {
      const idx = s.indexOf('=');
      if (idx < 0) throw new Error(`Expected key=v1,v2, got: ${s}`);
      const key = s.slice(0, idx);
      const values = s.slice(idx + 1).split(',').map((v) => parseValue(v.trim()));
      inObj[key] = values;
    }
    clauses.push(on ? { on, in: inObj } : { in: inObj });
  }

  // Range ops coalesce per-field: `--gt price=100 --lte price=500` →
  // `{range: {price: {gt: 100, lte: 500}}}`. Each op can be specified
  // multiple times for different fields.
  const ranges: Record<string, Record<string, unknown>> = {};
  const applyRange = (op: 'gt' | 'gte' | 'lt' | 'lte', items?: string[]) => {
    for (const s of items ?? []) {
      const idx = s.indexOf('=');
      if (idx < 0) throw new Error(`Expected key=value, got: ${s}`);
      const key = s.slice(0, idx);
      ranges[key] ??= {};
      ranges[key][op] = parseValue(s.slice(idx + 1));
    }
  };
  applyRange('gt', flags.gt);
  applyRange('gte', flags.gte);
  applyRange('lt', flags.lt);
  applyRange('lte', flags.lte);
  if (Object.keys(ranges).length) {
    clauses.push(on ? { on, range: ranges } : { range: ranges });
  }

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { every: clauses };
}

export interface SortFlags {
  sort?: string[];
  sortOn?: string;
}

/**
 * Build a Boxel sort spec from `field:direction` strings. Returns
 * undefined when no sort is specified. Direction defaults to 'asc'.
 */
export function buildSort(flags: SortFlags): any[] | undefined {
  if (!flags.sort?.length) return undefined;
  const sortOn = flags.sortOn ? parseCodeRef(flags.sortOn) : undefined;
  return flags.sort.map((s) => {
    const [by, direction = 'asc'] = s.split(':');
    if (direction !== 'asc' && direction !== 'desc') {
      throw new Error(`Invalid sort direction: ${direction} (must be asc|desc)`);
    }
    return sortOn ? { by, on: sortOn, direction } : { by, direction };
  });
}

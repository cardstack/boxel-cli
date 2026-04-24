import { describe, it, expect } from 'vitest';
import {
  parseValue,
  parseKV,
  parseCodeRef,
  buildFilterFromFlags,
  buildSort,
} from '../../src/lib/card-filter.js';

describe('parseValue', () => {
  it('parses numbers', () => {
    expect(parseValue('42')).toBe(42);
    expect(parseValue('-3.14')).toBe(-3.14);
    expect(parseValue('0')).toBe(0);
  });

  it('parses booleans and null', () => {
    expect(parseValue('true')).toBe(true);
    expect(parseValue('false')).toBe(false);
    expect(parseValue('null')).toBe(null);
  });

  it('parses JSON arrays and objects', () => {
    expect(parseValue('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parseValue('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON-quoted strings and strips the quotes', () => {
    expect(parseValue('"hello"')).toBe('hello');
  });

  it('returns bare unquoted strings as-is (fallback)', () => {
    expect(parseValue('active')).toBe('active');
    expect(parseValue('some string with spaces')).toBe('some string with spaces');
  });

  it('returns empty string as empty string', () => {
    expect(parseValue('')).toBe('');
  });

  it('treats URLs as bare strings (they fail JSON.parse)', () => {
    expect(parseValue('https://example.com/foo')).toBe('https://example.com/foo');
  });
});

describe('parseKV', () => {
  it('parses a single key=value', () => {
    expect(parseKV(['status=active'])).toEqual({ status: 'active' });
  });

  it('parses multiple entries', () => {
    expect(parseKV(['a=1', 'b=true', 'c=hello'])).toEqual({
      a: 1,
      b: true,
      c: 'hello',
    });
  });

  it('preserves = characters after the first separator', () => {
    expect(parseKV(['url=https://example.com?a=b'])).toEqual({
      url: 'https://example.com?a=b',
    });
  });

  it('returns {} for undefined or empty input', () => {
    expect(parseKV(undefined)).toEqual({});
    expect(parseKV([])).toEqual({});
  });

  it('throws on missing =', () => {
    expect(() => parseKV(['bogus'])).toThrow(/Expected key=value/);
  });

  it('allows empty values', () => {
    expect(parseKV(['key='])).toEqual({ key: '' });
  });

  it('throws on empty key', () => {
    expect(() => parseKV(['=value'])).toThrow(/non-empty key/);
  });
});

describe('parseCodeRef', () => {
  it('parses simple module#Name', () => {
    expect(parseCodeRef('./presence#Presence')).toEqual({
      module: './presence',
      name: 'Presence',
    });
  });

  it('parses full URL module refs', () => {
    expect(parseCodeRef('https://example.com/realms/m/presence#Presence')).toEqual({
      module: 'https://example.com/realms/m/presence',
      name: 'Presence',
    });
  });

  it('uses the LAST # as the separator (module fragments survive)', () => {
    expect(parseCodeRef('https://example.com/mod#withFrag#Name')).toEqual({
      module: 'https://example.com/mod#withFrag',
      name: 'Name',
    });
  });

  it('throws on missing #', () => {
    expect(() => parseCodeRef('no-hash-here')).toThrow(/module-url.*Name/);
  });

  it('throws on empty module or name', () => {
    expect(() => parseCodeRef('#Name')).toThrow();
    expect(() => parseCodeRef('module#')).toThrow();
  });
});

describe('buildFilterFromFlags', () => {
  it('returns undefined when no flags set', () => {
    expect(buildFilterFromFlags({})).toBeUndefined();
  });

  it('builds a pure CardTypeFilter from --type alone', () => {
    expect(
      buildFilterFromFlags({ type: './presence#Presence' }),
    ).toEqual({ type: { module: './presence', name: 'Presence' } });
  });

  it('builds an EqFilter from --eq alone', () => {
    expect(buildFilterFromFlags({ eq: ['status=active'] })).toEqual({
      eq: { status: 'active' },
    });
  });

  it('scopes eq with --on', () => {
    expect(
      buildFilterFromFlags({
        on: './presence#Presence',
        eq: ['status=active'],
      }),
    ).toEqual({
      on: { module: './presence', name: 'Presence' },
      eq: { status: 'active' },
    });
  });

  it('auto-parses numeric values in eq', () => {
    expect(buildFilterFromFlags({ eq: ['total=100', 'name=Acme'] })).toEqual({
      eq: { total: 100, name: 'Acme' },
    });
  });

  it('builds an InFilter from --in with comma-separated values', () => {
    expect(
      buildFilterFromFlags({ in: ['status=active,idle'] }),
    ).toEqual({ in: { status: ['active', 'idle'] } });
  });

  it('builds a ContainsFilter from --contains', () => {
    expect(
      buildFilterFromFlags({ contains: ['headline=migration'] }),
    ).toEqual({ contains: { headline: 'migration' } });
  });

  it('coalesces range ops on the same field', () => {
    expect(
      buildFilterFromFlags({
        gt: ['price=100'],
        lte: ['price=500'],
      }),
    ).toEqual({
      range: { price: { gt: 100, lte: 500 } },
    });
  });

  it('supports range ops across multiple fields', () => {
    expect(
      buildFilterFromFlags({
        gte: ['price=100', 'quantity=1'],
        lt: ['price=1000'],
      }),
    ).toEqual({
      range: {
        price: { gte: 100, lt: 1000 },
        quantity: { gte: 1 },
      },
    });
  });

  it('wraps multiple clauses in EveryFilter', () => {
    const result = buildFilterFromFlags({
      type: './presence#Presence',
      eq: ['status=active'],
    });
    expect(result).toEqual({
      every: [
        { type: { module: './presence', name: 'Presence' } },
        { eq: { status: 'active' } },
      ],
    });
  });

  it('applies --on to every field-filter clause (not CardTypeFilter)', () => {
    const result = buildFilterFromFlags({
      on: './p#P',
      type: './q#Q',
      eq: ['x=1'],
      contains: ['y=foo'],
    });
    expect(result).toEqual({
      every: [
        { type: { module: './q', name: 'Q' } },
        { on: { module: './p', name: 'P' }, eq: { x: 1 } },
        { on: { module: './p', name: 'P' }, contains: { y: 'foo' } },
      ],
    });
  });

  it('returns a single filter clause unwrapped when only one clause is present', () => {
    const result = buildFilterFromFlags({ eq: ['status=active'] });
    expect(result).toEqual({ eq: { status: 'active' } });
    expect(result).not.toHaveProperty('every');
  });
});

describe('buildSort', () => {
  it('returns undefined when no sort flag', () => {
    expect(buildSort({})).toBeUndefined();
    expect(buildSort({ sort: [] })).toBeUndefined();
  });

  it('defaults to asc when direction is omitted', () => {
    expect(buildSort({ sort: ['createdAt'] })).toEqual([
      { by: 'createdAt', direction: 'asc' },
    ]);
  });

  it('accepts explicit direction', () => {
    expect(buildSort({ sort: ['createdAt:desc'] })).toEqual([
      { by: 'createdAt', direction: 'desc' },
    ]);
  });

  it('attaches --sort-on to each sort expression', () => {
    expect(
      buildSort({
        sort: ['price:desc'],
        sortOn: './invoice#Invoice',
      }),
    ).toEqual([
      {
        by: 'price',
        on: { module: './invoice', name: 'Invoice' },
        direction: 'desc',
      },
    ]);
  });

  it('supports multiple sort expressions in order', () => {
    expect(
      buildSort({ sort: ['status:asc', 'lastActiveAt:desc'] }),
    ).toEqual([
      { by: 'status', direction: 'asc' },
      { by: 'lastActiveAt', direction: 'desc' },
    ]);
  });

  it('rejects invalid directions', () => {
    expect(() => buildSort({ sort: ['x:sideways'] })).toThrow(/direction/);
  });

  it('rejects empty sort field name', () => {
    expect(() => buildSort({ sort: [':desc'] })).toThrow(/field name/);
  });
});

describe('buildFilterFromFlags — input validation', () => {
  it('rejects empty key in --in', () => {
    expect(() => buildFilterFromFlags({ in: ['=a,b'] })).toThrow(/non-empty key/);
  });

  it('rejects empty key in range ops', () => {
    expect(() => buildFilterFromFlags({ gt: ['=100'] })).toThrow(/non-empty key/);
  });
});

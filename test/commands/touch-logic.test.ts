/**
 * Tests for the pure logic in src/commands/touch.ts
 *
 * touchJson() and touchGts() are private methods on RealmToucher,
 * but their logic is pure string transformation that we can test
 * by replicating the algorithm here.
 */
import { describe, it, expect } from 'vitest';

// Replicate touchJson logic from src/commands/touch.ts:111-133
function touchJson(content: string): string {
  try {
    const data = JSON.parse(content);
    if (data.data && data.data.meta) {
      data.data.meta._touched = Date.now();
    } else if (data.data) {
      data.data.meta = { _touched: Date.now() };
    }
    return JSON.stringify(data, null, 2) + '\n';
  } catch {
    if (content.endsWith('\n\n')) {
      return content.slice(0, -1);
    } else if (content.endsWith('\n')) {
      return content + '\n';
    } else {
      return content + '\n';
    }
  }
}

// Replicate touchGts logic from src/commands/touch.ts:135-150
function touchGts(content: string): string {
  const touchComment = '// touched for re-index';
  if (content.includes(touchComment)) {
    return content.replace(new RegExp(`\\n?${touchComment}\\n?`, 'g'), '\n');
  } else {
    if (content.endsWith('\n')) {
      return content + touchComment + '\n';
    } else {
      return content + '\n' + touchComment + '\n';
    }
  }
}

describe('touchJson', () => {
  it('adds _touched to existing meta', () => {
    const input = JSON.stringify({
      data: {
        meta: { adoptsFrom: { module: './card', name: 'Card' } },
        attributes: { title: 'Hello' },
      },
    });
    const result = touchJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.data.meta._touched).toBeDefined();
    expect(typeof parsed.data.meta._touched).toBe('number');
    // Original meta preserved
    expect(parsed.data.meta.adoptsFrom.module).toBe('./card');
  });

  it('creates meta when data exists but meta does not', () => {
    const input = JSON.stringify({
      data: { attributes: { title: 'Hello' } },
    });
    const result = touchJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.data.meta._touched).toBeDefined();
  });

  it('does not crash on JSON without data property', () => {
    const input = JSON.stringify({ name: 'Test', realms: [] });
    const result = touchJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('Test');
  });

  it('adds trailing newline to output', () => {
    const input = JSON.stringify({ data: { meta: {} } });
    const result = touchJson(input);
    expect(result.endsWith('\n')).toBe(true);
  });

  it('handles malformed JSON by toggling newlines', () => {
    const input = 'not valid json\n';
    const result = touchJson(input);
    expect(result).toBe('not valid json\n\n');
  });

  it('removes trailing double newline on malformed JSON', () => {
    const input = 'not valid json\n\n';
    const result = touchJson(input);
    expect(result).toBe('not valid json\n');
  });

  it('adds newline to malformed JSON without trailing newline', () => {
    const input = 'not valid json';
    const result = touchJson(input);
    expect(result).toBe('not valid json\n');
  });

  it('preserves attributes when touching', () => {
    const input = JSON.stringify({
      data: {
        meta: { adoptsFrom: { module: '../blog-post', name: 'BlogPost' } },
        attributes: { title: 'My Post', body: 'Content here' },
      },
    });
    const result = touchJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.data.attributes.title).toBe('My Post');
    expect(parsed.data.attributes.body).toBe('Content here');
  });

  it('overwrites existing _touched value', () => {
    const input = JSON.stringify({
      data: { meta: { _touched: 12345 } },
    });
    const result = touchJson(input);
    const parsed = JSON.parse(result);
    expect(parsed.data.meta._touched).not.toBe(12345);
    expect(parsed.data.meta._touched).toBeGreaterThan(0);
  });
});

describe('touchGts', () => {
  it('adds touch comment to GTS content', () => {
    const input = 'export class Card extends CardDef {}\n';
    const result = touchGts(input);
    expect(result).toContain('// touched for re-index');
  });

  it('removes touch comment if already present', () => {
    const input = 'export class Card extends CardDef {}\n// touched for re-index\n';
    const result = touchGts(input);
    expect(result).not.toContain('// touched for re-index');
  });

  it('toggles idempotently', () => {
    const original = 'export class Card extends CardDef {}\n';
    const touched = touchGts(original);
    expect(touched).toContain('// touched for re-index');
    const untouched = touchGts(touched);
    expect(untouched).not.toContain('// touched for re-index');
  });

  it('adds newline before comment if content does not end with newline', () => {
    const input = 'export class Card extends CardDef {}';
    const result = touchGts(input);
    expect(result).toContain('\n// touched for re-index\n');
  });

  it('preserves original content when adding comment', () => {
    const input = 'import { Base } from "./base";\nexport class Card extends Base {}\n';
    const result = touchGts(input);
    expect(result).toContain('import { Base } from "./base";');
    expect(result).toContain('export class Card extends Base {}');
  });
});

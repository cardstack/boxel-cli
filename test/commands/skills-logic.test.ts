/**
 * Tests for the pure logic in src/commands/skills.ts
 *
 * parseSkillsResponse() and extractTitleFromInstructions() are module-private,
 * so we replicate the algorithms here to test them.
 */
import { describe, it, expect } from 'vitest';

// Replicate extractTitleFromInstructions from src/commands/skills.ts:128-138
function extractTitleFromInstructions(instructions: string | undefined): string | undefined {
  if (!instructions) return undefined;
  const match = instructions.match(/^#\s+(.+?)(?:\n|$)/);
  if (match) {
    return match[1].replace(/[🎯⛩️🏆🔭🛰️]/g, '').trim();
  }
  return undefined;
}

// Replicate parseSkillsResponse from src/commands/skills.ts:100-126
function parseSkillsResponse(data: any, realmUrl: string): any[] {
  if (!data.data || !Array.isArray(data.data)) {
    return [];
  }
  return data.data.map((card: any) => {
    const title = card.attributes?.cardTitle ||
                  card.attributes?.title ||
                  extractTitleFromInstructions(card.attributes?.instructions) ||
                  'Untitled Skill';
    return {
      id: card.id,
      title,
      instructions: card.attributes?.instructions || '',
      description: card.attributes?.description,
      realmUrl,
    };
  });
}

describe('extractTitleFromInstructions', () => {
  it('extracts title from markdown heading', () => {
    expect(extractTitleFromInstructions('# My Skill\nSome instructions'))
      .toBe('My Skill');
  });

  it('strips emoji from title', () => {
    expect(extractTitleFromInstructions('# 🎯 Target Practice\nDo stuff'))
      .toBe('Target Practice');
  });

  it('strips multiple emojis', () => {
    expect(extractTitleFromInstructions('# 🏆 Champion 🔭 Skill\n'))
      .toBe('Champion  Skill');
  });

  it('returns undefined for no heading', () => {
    expect(extractTitleFromInstructions('Just some text without heading'))
      .toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(extractTitleFromInstructions(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(extractTitleFromInstructions('')).toBeUndefined();
  });

  it('handles heading at end of string (no newline)', () => {
    expect(extractTitleFromInstructions('# Final Heading'))
      .toBe('Final Heading');
  });

  it('only matches first heading', () => {
    expect(extractTitleFromInstructions('# First\n# Second'))
      .toBe('First');
  });

  it('requires space after #', () => {
    expect(extractTitleFromInstructions('#NoSpace\nContent'))
      .toBeUndefined();
  });
});

describe('parseSkillsResponse', () => {
  const realmUrl = 'https://app.boxel.ai/skills/';

  it('parses valid response with cardTitle', () => {
    const data = {
      data: [{
        id: 'skill-1',
        attributes: {
          cardTitle: 'My Skill',
          instructions: '# My Skill\nDo things',
          description: 'A helpful skill',
        },
      }],
    };
    const result = parseSkillsResponse(data, realmUrl);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('skill-1');
    expect(result[0].title).toBe('My Skill');
    expect(result[0].instructions).toBe('# My Skill\nDo things');
    expect(result[0].description).toBe('A helpful skill');
    expect(result[0].realmUrl).toBe(realmUrl);
  });

  it('falls back to title attribute', () => {
    const data = {
      data: [{
        id: 'skill-2',
        attributes: {
          title: 'Fallback Title',
          instructions: 'Some instructions',
        },
      }],
    };
    const result = parseSkillsResponse(data, realmUrl);
    expect(result[0].title).toBe('Fallback Title');
  });

  it('falls back to extracting from instructions heading', () => {
    const data = {
      data: [{
        id: 'skill-3',
        attributes: {
          instructions: '# Extracted Title\nSome content',
        },
      }],
    };
    const result = parseSkillsResponse(data, realmUrl);
    expect(result[0].title).toBe('Extracted Title');
  });

  it('falls back to Untitled Skill', () => {
    const data = {
      data: [{
        id: 'skill-4',
        attributes: {
          instructions: 'No heading here',
        },
      }],
    };
    const result = parseSkillsResponse(data, realmUrl);
    expect(result[0].title).toBe('Untitled Skill');
  });

  it('returns empty array for missing data', () => {
    expect(parseSkillsResponse({}, realmUrl)).toEqual([]);
  });

  it('returns empty array for non-array data', () => {
    expect(parseSkillsResponse({ data: 'not an array' }, realmUrl)).toEqual([]);
  });

  it('handles multiple skills', () => {
    const data = {
      data: [
        { id: '1', attributes: { cardTitle: 'First' } },
        { id: '2', attributes: { cardTitle: 'Second' } },
        { id: '3', attributes: { title: 'Third' } },
      ],
    };
    const result = parseSkillsResponse(data, realmUrl);
    expect(result).toHaveLength(3);
    expect(result.map((s: any) => s.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('handles missing attributes gracefully', () => {
    const data = {
      data: [{ id: 'empty' }],
    };
    const result = parseSkillsResponse(data, realmUrl);
    expect(result[0].title).toBe('Untitled Skill');
    expect(result[0].instructions).toBe('');
  });
});

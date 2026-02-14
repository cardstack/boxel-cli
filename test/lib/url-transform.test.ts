import { describe, it, expect } from 'vitest';
import {
  maybeURL,
  relativeURL,
  maybeRelativeURL,
  transformUrlsToRelative,
  makeRealmFilePortable,
  extractRealmUrl,
} from '../../src/lib/url-transform.js';

describe('maybeURL', () => {
  it('parses valid absolute URL', () => {
    const result = maybeURL('https://example.com/path');
    expect(result).toBeInstanceOf(URL);
    expect(result?.href).toBe('https://example.com/path');
  });

  it('parses relative URL with base', () => {
    const result = maybeURL('./card', 'https://example.com/realm/');
    expect(result?.href).toBe('https://example.com/realm/card');
  });

  it('returns undefined for invalid URL', () => {
    const result = maybeURL('not a url');
    expect(result).toBeUndefined();
  });

  it('returns undefined for invalid URL without base', () => {
    const result = maybeURL('');
    expect(result).toBeUndefined();
  });
});

describe('relativeURL', () => {
  it('converts absolute URL to relative path', () => {
    const url = new URL('https://realm.test/user/workspace/Card/hello.json');
    const relativeTo = new URL('https://realm.test/user/workspace/');
    const realm = new URL('https://realm.test/user/workspace/');

    const result = relativeURL(url, relativeTo, realm);

    expect(result).toBe('./Card/hello.json');
  });

  it('returns undefined for different origins', () => {
    const url = new URL('https://other.com/path');
    const relativeTo = new URL('https://realm.test/path');

    const result = relativeURL(url, relativeTo);

    expect(result).toBeUndefined();
  });

  it('returns undefined for URL outside realm', () => {
    const url = new URL('https://realm.test/other-user/other-realm/Card/x.json');
    const relativeTo = new URL('https://realm.test/user/workspace/');
    const realm = new URL('https://realm.test/user/workspace/');

    const result = relativeURL(url, relativeTo, realm);

    expect(result).toBeUndefined();
  });

  it('handles parent directory navigation', () => {
    const url = new URL('https://realm.test/user/workspace/blog-post.gts');
    const relativeTo = new URL('https://realm.test/user/workspace/BlogPost/hello.json');
    const realm = new URL('https://realm.test/user/workspace/');

    const result = relativeURL(url, relativeTo, realm);

    expect(result).toBe('../blog-post.gts');
  });

  it('handles same directory reference', () => {
    const url = new URL('https://realm.test/user/workspace/cards-grid');
    const relativeTo = new URL('https://realm.test/user/workspace/index.json');
    const realm = new URL('https://realm.test/user/workspace/');

    const result = relativeURL(url, relativeTo, realm);

    expect(result).toBe('./cards-grid');
  });
});

describe('maybeRelativeURL', () => {
  it('returns relative URL when conversion succeeds', () => {
    const url = new URL('https://realm.test/user/workspace/Card/x.json');
    const relativeTo = new URL('https://realm.test/user/workspace/');
    const realm = new URL('https://realm.test/user/workspace/');

    const result = maybeRelativeURL(url, relativeTo, realm);

    expect(result).toBe('./Card/x.json');
  });

  it('returns original href when conversion fails', () => {
    const url = new URL('https://other.com/path');
    const relativeTo = new URL('https://realm.test/path');

    const result = maybeRelativeURL(url, relativeTo);

    expect(result).toBe('https://other.com/path');
  });
});

describe('transformUrlsToRelative', () => {
  const fileUrl = new URL('https://realm.test/user/workspace/');
  const realmUrl = new URL('https://realm.test/user/workspace/');

  it('transforms top-level links.self', () => {
    const json = {
      links: { self: 'https://realm.test/user/workspace/Card/x.json' },
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.links.self).toBe('./Card/x.json');
  });

  it('transforms top-level id', () => {
    const json = {
      id: 'https://realm.test/user/workspace/Card/hello',
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.id).toBe('./Card/hello');
  });

  it('transforms data.id', () => {
    const json = {
      data: {
        id: 'https://realm.test/user/workspace/index',
      },
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.data.id).toBe('./index');
  });

  it('transforms data.links.self', () => {
    const json = {
      data: {
        links: { self: 'https://realm.test/user/workspace/index' },
      },
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.data.links.self).toBe('./index');
  });

  it('transforms data.relationships', () => {
    const json = {
      data: {
        relationships: {
          cards: {
            links: { self: 'https://realm.test/user/workspace/cards-grid' },
          },
        },
      },
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.data.relationships.cards.links.self).toBe('./cards-grid');
  });

  it('transforms included resources', () => {
    const json = {
      data: { id: 'https://realm.test/user/workspace/index' },
      included: [
        {
          id: 'https://realm.test/user/workspace/Card/one',
          links: { self: 'https://realm.test/user/workspace/Card/one' },
        },
        {
          id: 'https://realm.test/user/workspace/Card/two',
          links: { self: 'https://realm.test/user/workspace/Card/two' },
        },
      ],
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.included[0].id).toBe('./Card/one');
    expect(result.included[0].links.self).toBe('./Card/one');
    expect(result.included[1].id).toBe('./Card/two');
  });

  it('transforms nested cards array in attributes', () => {
    const json = {
      data: {
        attributes: {
          cards: [
            { id: 'https://realm.test/user/workspace/Card/a' },
            { id: 'https://realm.test/user/workspace/Card/b' },
          ],
        },
      },
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.data.attributes.cards[0].id).toBe('./Card/a');
    expect(result.data.attributes.cards[1].id).toBe('./Card/b');
  });

  it('leaves external URLs unchanged', () => {
    const json = {
      data: {
        id: 'https://other.com/card/x',
        links: { self: 'https://other.com/card/x' },
      },
    };

    const result = transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(result.data.id).toBe('https://other.com/card/x');
    expect(result.data.links.self).toBe('https://other.com/card/x');
  });

  it('handles null input', () => {
    const result = transformUrlsToRelative(null, fileUrl, realmUrl);
    expect(result).toBeNull();
  });

  it('handles primitive input', () => {
    const result = transformUrlsToRelative('string', fileUrl, realmUrl);
    expect(result).toBe('string');
  });

  it('does not mutate original object', () => {
    const json = {
      data: { id: 'https://realm.test/user/workspace/Card/x' },
    };
    const original = JSON.stringify(json);

    transformUrlsToRelative(json, fileUrl, realmUrl);

    expect(JSON.stringify(json)).toBe(original);
  });
});

describe('makeRealmFilePortable', () => {
  it('transforms index.json URLs to relative', () => {
    const content = JSON.stringify({
      data: {
        id: 'https://realm.test/user/workspace/index',
        links: { self: 'https://realm.test/user/workspace/index' },
        relationships: {
          cards: {
            links: { self: 'https://realm.test/user/workspace/cards-grid' },
          },
        },
      },
    });

    const result = makeRealmFilePortable(content, 'https://realm.test/user/workspace/');
    const parsed = JSON.parse(result);

    expect(parsed.data.id).toBe('./index');
    expect(parsed.data.links.self).toBe('./index');
    expect(parsed.data.relationships.cards.links.self).toBe('./cards-grid');
  });

  it('handles realm URL without trailing slash', () => {
    const content = JSON.stringify({
      data: { id: 'https://realm.test/user/workspace/index' },
    });

    const result = makeRealmFilePortable(content, 'https://realm.test/user/workspace');
    const parsed = JSON.parse(result);

    expect(parsed.data.id).toBe('./index');
  });

  it('returns original content for invalid JSON', () => {
    const content = 'not valid json {{';

    const result = makeRealmFilePortable(content, 'https://realm.test/');

    expect(result).toBe(content);
  });

  it('pretty-prints the output', () => {
    const content = JSON.stringify({ data: { id: 'https://realm.test/x' } });

    const result = makeRealmFilePortable(content, 'https://realm.test/');

    expect(result).toContain('\n');
    expect(result).toContain('  '); // indentation
  });

  it('preserves non-URL attributes', () => {
    const content = JSON.stringify({
      data: {
        id: 'https://realm.test/card',
        attributes: {
          title: 'My Title',
          count: 42,
          nested: { key: 'value' },
        },
      },
    });

    const result = makeRealmFilePortable(content, 'https://realm.test/');
    const parsed = JSON.parse(result);

    expect(parsed.data.attributes.title).toBe('My Title');
    expect(parsed.data.attributes.count).toBe(42);
    expect(parsed.data.attributes.nested.key).toBe('value');
  });
});

describe('extractRealmUrl', () => {

  describe('production URLs (app.boxel.ai)', () => {
    it('extracts realm from card instance URL', () => {
      const url = 'https://app.boxel.ai/acme/workspace/BlogPost/abc123';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/workspace/');
    });

    it('extracts realm from index URL', () => {
      const url = 'https://app.boxel.ai/acme/workspace/index';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/workspace/');
    });

    it('extracts realm from index.json URL', () => {
      const url = 'https://app.boxel.ai/acme/workspace/index.json';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/workspace/');
    });

    it('normalizes realm URL with trailing slash', () => {
      const url = 'https://app.boxel.ai/acme/workspace';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/workspace/');
    });

    it('preserves realm URL that already has trailing slash', () => {
      const url = 'https://app.boxel.ai/acme/workspace/';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/workspace/');
    });

    it('extracts realm from deeply nested card path', () => {
      const url = 'https://app.boxel.ai/tribecaprep/employee-handbook/Document/d8341312-f3a0-442b-a2e5-49c5cdd84695';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/tribecaprep/employee-handbook/');
    });

    it('handles cards-grid URL', () => {
      const url = 'https://app.boxel.ai/acme/workspace/cards-grid';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/workspace/');
    });
  });

  describe('staging URLs (realms-staging.stack.cards)', () => {
    it('extracts realm from index URL', () => {
      const url = 'https://realms-staging.stack.cards/ctse/smart-bank/index';
      expect(extractRealmUrl(url)).toBe('https://realms-staging.stack.cards/ctse/smart-bank/');
    });

    it('extracts realm from card instance URL', () => {
      const url = 'https://realms-staging.stack.cards/ctse/smart-bank/Transaction/txn-001';
      expect(extractRealmUrl(url)).toBe('https://realms-staging.stack.cards/ctse/smart-bank/');
    });

    it('normalizes realm URL without trailing slash', () => {
      const url = 'https://realms-staging.stack.cards/ctse/smart-bank';
      expect(extractRealmUrl(url)).toBe('https://realms-staging.stack.cards/ctse/smart-bank/');
    });
  });

  describe('edge cases', () => {
    it('handles URL with only owner (no realm)', () => {
      const url = 'https://app.boxel.ai/acme';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/');
    });

    it('handles root URL', () => {
      const url = 'https://app.boxel.ai/';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/');
    });

    it('handles URL with whitespace', () => {
      const url = '  https://app.boxel.ai/acme/workspace/index  ';
      expect(extractRealmUrl(url)).toBe('https://app.boxel.ai/acme/workspace/');
    });

    it('returns invalid input as-is', () => {
      const input = 'not-a-url';
      expect(extractRealmUrl(input)).toBe('not-a-url');
    });

    it('handles unknown hosts with index suffix', () => {
      const url = 'https://custom-realm.example.com/my/path/index';
      expect(extractRealmUrl(url)).toBe('https://custom-realm.example.com/my/path/');
    });

    it('handles unknown hosts with card path pattern', () => {
      const url = 'https://custom-realm.example.com/my/path/BlogPost/hello';
      expect(extractRealmUrl(url)).toBe('https://custom-realm.example.com/my/path/');
    });
  });
});

/**
 * URL transformation utilities for making card JSON portable across realms.
 *
 * When sharing/gathering index.json and cards-grid.json between realms,
 * absolute URLs need to be converted to relative URLs so the files work
 * in different realm contexts.
 */

/**
 * Safely parse a URL, returning undefined if invalid
 */
export function maybeURL(
  possibleURL: string,
  relativeTo?: string | URL | undefined
): URL | undefined {
  try {
    return new URL(possibleURL, relativeTo);
  } catch (e: any) {
    if (e.message.includes('Invalid URL')) {
      return undefined;
    }
    throw e;
  }
}

/**
 * Convert an absolute URL to a relative path from the given base URL.
 * Returns undefined if the URLs have different origins or if the target
 * is outside the realm.
 */
export function relativeURL(
  url: URL,
  relativeTo: URL,
  realmURL?: URL
): string | undefined {
  if (url.origin !== relativeTo.origin) {
    return undefined;
  }

  // Don't relativize URLs outside our realm
  if (realmURL) {
    const realmPath = realmURL.pathname.replace(/\/$/, '');
    const urlPath = url.pathname;
    const relativeToPath = relativeTo.pathname;

    // Check if both URLs are within the realm
    const urlInRealm = urlPath.startsWith(realmPath);
    const relativeToInRealm = relativeToPath.startsWith(realmPath);

    if (relativeToInRealm && !urlInRealm) {
      return undefined;
    }
  }

  const ourParts = url.pathname.split('/');
  const theirParts = relativeTo.pathname.split('/');

  let lastPart: string | undefined;
  while (
    ourParts[0] === theirParts[0] &&
    ourParts.length > 0 &&
    theirParts.length > 0
  ) {
    lastPart = ourParts.shift();
    theirParts.shift();
  }

  if (theirParts.length > 1) {
    theirParts.shift();
    const relative = [...theirParts.map(() => '..'), ...ourParts].join('/');
    return relative === '.' && lastPart ? `./${lastPart}` : relative;
  } else {
    const relative = ['.', ...ourParts].join('/');
    return relative === '.' && lastPart ? `./${lastPart}` : relative;
  }
}

/**
 * Convert absolute URL to relative if possible, otherwise return the original href
 */
export function maybeRelativeURL(
  url: URL,
  relativeTo: URL,
  realmURL?: URL
): string {
  const rel = relativeURL(url, relativeTo, realmURL);
  return rel ?? url.href;
}

/**
 * Transform a URL string to relative if it's within the realm
 */
function transformUrl(
  urlString: string,
  fileUrl: URL,
  realmUrl: URL
): string {
  const url = maybeURL(urlString);
  if (url && url.origin === realmUrl.origin) {
    return maybeRelativeURL(url, fileUrl, realmUrl);
  }
  return urlString;
}

/**
 * Transform links object (handles links.self)
 */
function transformLinks(
  links: any,
  fileUrl: URL,
  realmUrl: URL
): any {
  if (!links || typeof links !== 'object') {
    return links;
  }

  const result = { ...links };
  if (result.self && typeof result.self === 'string') {
    result.self = transformUrl(result.self, fileUrl, realmUrl);
  }
  return result;
}

/**
 * Transform relationships object
 */
function transformRelationships(
  relationships: any,
  fileUrl: URL,
  realmUrl: URL
): any {
  if (!relationships || typeof relationships !== 'object') {
    return relationships;
  }

  const result: any = {};
  for (const [key, rel] of Object.entries(relationships)) {
    if (rel && typeof rel === 'object') {
      const relationship = rel as any;
      result[key] = {
        ...relationship,
        links: transformLinks(relationship.links, fileUrl, realmUrl),
      };
    } else {
      result[key] = rel;
    }
  }
  return result;
}

/**
 * Transform all absolute URLs in a card resource JSON to relative URLs.
 * This makes the JSON portable across different realms.
 *
 * Handles JSON:API format where data is nested under 'data' key.
 *
 * @param json - The parsed JSON content (card resource)
 * @param fileUrl - The URL of the file containing this JSON (for computing relative paths)
 * @param realmUrl - The realm URL (to check boundaries)
 * @returns The transformed JSON object
 */
export function transformUrlsToRelative(
  json: any,
  fileUrl: URL,
  realmUrl: URL
): any {
  if (!json || typeof json !== 'object') {
    return json;
  }

  const result = Array.isArray(json) ? [...json] : { ...json };

  // Transform top-level links.self (for included resources)
  if (result.links) {
    result.links = transformLinks(result.links, fileUrl, realmUrl);
  }

  // Transform top-level relationships (for included resources)
  if (result.relationships) {
    result.relationships = transformRelationships(result.relationships, fileUrl, realmUrl);
  }

  // Transform top-level id (for included resources)
  if (result.id && typeof result.id === 'string') {
    result.id = transformUrl(result.id, fileUrl, realmUrl);
  }

  // Handle JSON:API data wrapper
  if (result.data && typeof result.data === 'object') {
    result.data = { ...result.data };

    // Transform data.id
    if (result.data.id && typeof result.data.id === 'string') {
      result.data.id = transformUrl(result.data.id, fileUrl, realmUrl);
    }

    // Transform data.links
    if (result.data.links) {
      result.data.links = transformLinks(result.data.links, fileUrl, realmUrl);
    }

    // Transform data.relationships
    if (result.data.relationships) {
      result.data.relationships = transformRelationships(result.data.relationships, fileUrl, realmUrl);
    }

    // Transform nested cards array (for cards-grid.json)
    if (result.data.attributes?.cards && Array.isArray(result.data.attributes.cards)) {
      result.data.attributes = {
        ...result.data.attributes,
        cards: result.data.attributes.cards.map((card: any) =>
          transformUrlsToRelative(card, fileUrl, realmUrl)
        ),
      };
    }
  }

  // Recursively transform included resources
  if (Array.isArray(result.included)) {
    result.included = result.included.map((item: any) =>
      transformUrlsToRelative(item, fileUrl, realmUrl)
    );
  }

  return result;
}

/**
 * Process a realm metadata file (index.json or cards-grid.json) to make URLs relative.
 *
 * @param content - The file content as a string
 * @param realmUrl - The realm URL these files came from
 * @returns The transformed content as a string
 */
export function makeRealmFilePortable(content: string, realmUrl: string): string {
  try {
    const json = JSON.parse(content);
    const realm = new URL(realmUrl.endsWith('/') ? realmUrl : realmUrl + '/');

    // For index.json, the file URL is the realm root
    // For cards-grid.json, it's at the realm root too
    const fileUrl = realm;

    const transformed = transformUrlsToRelative(json, fileUrl, realm);
    return JSON.stringify(transformed, null, 2);
  } catch (e) {
    // If parsing fails, return original content
    console.warn('Warning: Could not transform URLs in file:', e);
    return content;
  }
}

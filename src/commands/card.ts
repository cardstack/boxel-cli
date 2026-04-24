// ─────────────────────────────────────────────────────────────────────
// `boxel card` — direct CRUD on realm card instances.
// ─────────────────────────────────────────────────────────────────────
// Unlike `boxel sync` / `boxel push` / `boxel touch`, these subcommands
// talk to the realm's card API directly — NO local filesystem, NO sync
// manifest, NO git. Intended for ephemeral or scripted mutations
// (presence, heartbeats, agent trails, one-off admin ops) where
// tracking the record as a durable file is the wrong abstraction.
//
// Endpoints used (see packages/runtime-common/realm.ts):
//   POST   /<type-folder>/     application/vnd.card+json → create
//   PATCH  /<card-path>         application/vnd.card+json → partial update
//   DELETE /<card-path>         → remove
//   GET    /<card-path>         application/vnd.card+json → read
//
// Card paths omit the `.json` extension (e.g. `/Annotation/foo` not
// `/Annotation/foo.json`).
// ─────────────────────────────────────────────────────────────────────
import { MatrixClient } from '../lib/matrix-client.js';
import { RealmAuthClient } from '../lib/realm-auth-client.js';
import { resolveWorkspace } from '../lib/workspace-resolver.js';
import { getProfileManager, formatProfileBadge } from '../lib/profile-manager.js';
import {
  buildFilterFromFlags,
  buildSort,
  type FilterFlags,
  type SortFlags,
} from '../lib/card-filter.js';
import * as fs from 'fs';
import qs from 'qs';

const CARD_JSON = 'application/vnd.card+json';
const API_JSON = 'application/vnd.api+json';

interface CommonOptions {
  file?: string;
  data?: string;
  stdin?: boolean;
  output?: string;
  quiet?: boolean;
  lid?: string;
}

// ─── Body loading ────────────────────────────────────────────────────

async function readBody(opts: CommonOptions): Promise<any> {
  let raw: string | undefined;
  if (opts.stdin) {
    raw = await readStdin();
  } else if (opts.file) {
    raw = fs.readFileSync(opts.file, 'utf8');
  } else if (opts.data) {
    raw = opts.data;
  } else {
    throw new Error(
      'No body supplied. Pass one of: --file <path>, --data <json>, --stdin',
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Body is not valid JSON: ${(e as Error).message}`);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c as Buffer));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

// ─── Auth helper ─────────────────────────────────────────────────────

async function authenticate(realmRef: string, quiet = false): Promise<{
  realmUrl: string;
  jwt: string;
}> {
  const profileManager = getProfileManager();
  const credentials = await profileManager.getActiveCredentials();
  if (!credentials) {
    throw new Error('No credentials. Run `boxel profile add` or set env vars.');
  }
  const { matrixUrl, username, password, profileId } = credentials;
  if (!quiet && profileId) {
    console.error(formatProfileBadge(profileId));
  }

  // Resolve realm URL — accept `.` / `./path` / `https://...` / `@user/ws`.
  // Pre-log-in Matrix if needed (for @-refs only).
  let matrixClient: MatrixClient | undefined;
  if (realmRef.startsWith('@')) {
    matrixClient = new MatrixClient({
      matrixURL: new URL(matrixUrl),
      username,
      password,
    });
    await matrixClient.login();
  }
  const resolved = await resolveWorkspace(realmRef, matrixClient);
  const realmUrl = resolved.workspaceUrl.endsWith('/')
    ? resolved.workspaceUrl
    : resolved.workspaceUrl + '/';

  // Get JWT for the realm
  if (!matrixClient) {
    matrixClient = new MatrixClient({
      matrixURL: new URL(matrixUrl),
      username,
      password,
    });
    await matrixClient.login();
  }
  const authClient = new RealmAuthClient(new URL(realmUrl), matrixClient);
  const jwt = await authClient.getJWT();
  return { realmUrl, jwt };
}

// ─── Helpers for argument normalization ──────────────────────────────

function cardUrl(realmUrl: string, cardPath: string): string {
  // Strip leading '/' and trailing '.json' (idempotent).
  const p = cardPath.replace(/^\/+/, '').replace(/\.json$/, '');
  return new URL(p, realmUrl).href;
}

function folderUrl(realmUrl: string, folder: string): string {
  // Ensure trailing '/' so realm routes to `createCard`. Empty folder
  // means "realm root" — POST to the realm URL itself (which already
  // ends in '/'). A non-empty folder appends relative to the realm.
  const trimmed = folder.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) return realmUrl; // realmUrl always ends with '/'
  return new URL(trimmed + '/', realmUrl).href;
}

// ─── Subcommand: create ──────────────────────────────────────────────

export async function cardCreateCommand(
  realmRef: string,
  folder: string,
  options: CommonOptions,
): Promise<void> {
  const { realmUrl, jwt } = await authenticate(realmRef, options.quiet);
  const body = await readBody(options);

  // If --lid is passed, set it on the primary resource. The realm uses
  // `data.lid` as the filename stem (otherwise it generates a UUID).
  if (options.lid && body?.data) {
    body.data.lid = options.lid;
  }

  const url = folderUrl(realmUrl, folder);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: CARD_JSON,
      'Content-Type': CARD_JSON,
      Authorization: jwt,
    },
    body: JSON.stringify(body),
  });
  await emitResult(res, options);
}

// ─── Subcommand: patch ───────────────────────────────────────────────

export async function cardPatchCommand(
  realmRef: string,
  cardPath: string,
  options: CommonOptions,
): Promise<void> {
  const { realmUrl, jwt } = await authenticate(realmRef, options.quiet);
  const body = await readBody(options);

  const url = cardUrl(realmUrl, cardPath);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Accept: CARD_JSON,
      'Content-Type': CARD_JSON,
      Authorization: jwt,
    },
    body: JSON.stringify(body),
  });
  await emitResult(res, options);
}

// ─── Subcommand: delete ──────────────────────────────────────────────

export async function cardDeleteCommand(
  realmRef: string,
  cardPath: string,
  options: CommonOptions,
): Promise<void> {
  const { realmUrl, jwt } = await authenticate(realmRef, options.quiet);
  const url = cardUrl(realmUrl, cardPath);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: CARD_JSON,
      Authorization: jwt,
    },
  });
  if (res.status === 204 || res.ok) {
    // Drain the body so the underlying connection is released; some
    // realms return 200 with a body on delete. We don't surface it —
    // delete is a fire-and-forget from the CLI's perspective.
    await res.arrayBuffer();
    if (!options.quiet) console.error(`Deleted ${cardPath} (${res.status})`);
    return;
  }
  await handleFailure(res);
}

// ─── Subcommand: get ─────────────────────────────────────────────────

export async function cardGetCommand(
  realmRef: string,
  cardPath: string,
  options: CommonOptions,
): Promise<void> {
  const { realmUrl, jwt } = await authenticate(realmRef, options.quiet);
  const url = cardUrl(realmUrl, cardPath);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: CARD_JSON,
      Authorization: jwt,
    },
  });
  await emitResult(res, options);
}

// ─── Subcommand: search — Boxel query language ──────────────────────
// Accepts common filter clauses as flags (--type, --eq, --in, --contains,
// --range) and composes them with an EveryFilter under an optional `--on`
// scope. For complex queries (any/not/nested), pass the full JSON via
// --file/--data/--stdin — skips the flag-composer entirely.
//
// Endpoint: POST /_search with `X-HTTP-Method-Override: QUERY` and a JSON
// body (Boxel realms require QUERY semantics; the override pattern is
// portable across Node fetch implementations). Returns a JSON:API
// collection document on stdout; --ids extracts just the id column.
// ─────────────────────────────────────────────────────────────────────

interface SearchOptions extends CommonOptions, FilterFlags, SortFlags {
  pageSize?: number;
  pageNumber?: number;
  ids?: boolean;             // print only `data[].id`, one per line
  curl?: boolean;            // print runnable curl command and exit (don't fetch)
  count?: boolean;           // print total count (meta.page.total)
}

export async function cardSearchCommand(
  realmRef: string,
  options: SearchOptions,
): Promise<void> {
  // Build the query object: filter from flags, OR load from --file/--data/--stdin.
  let query: any = {};
  if (options.file || options.data || options.stdin) {
    const body = await readBody(options);
    // Body can be either a full Query or just a Filter — accept both.
    if (body.filter || body.sort || body.page) {
      query = body;
    } else {
      query.filter = body;
    }
  } else {
    const filter = buildFilterFromFlags(options);
    if (filter) query.filter = filter;
  }

  const sort = buildSort(options);
  if (sort) query.sort = sort;

  if (options.pageSize !== undefined || options.pageNumber !== undefined) {
    query.page = {};
    if (options.pageSize !== undefined) query.page.size = options.pageSize;
    if (options.pageNumber !== undefined) query.page.number = options.pageNumber;
  }

  if (Object.keys(query).length === 0) {
    throw new Error('Empty query. Pass at least --type or provide --file/--data/--stdin.');
  }

  const { realmUrl, jwt } = await authenticate(realmRef, options.quiet);
  const searchUrl = `${realmUrl}_search`;

  if (options.curl) {
    // Emit a runnable curl invocation (JWT included) plus the qs form
    // commented out for eyeballing. Stdout stays shell-pasteable.
    const body = JSON.stringify(query);
    const shellSafeBody = body.replace(/'/g, "'\\''");
    const qsForm = qs.stringify(query, { strictNullHandling: true, encode: false });
    process.stdout.write(
      `# query (qs-encoded, for reference only — not the request shape):\n` +
      `#   ${searchUrl}?${qsForm}\n` +
      `curl -X POST '${searchUrl}' \\\n` +
      `  -H 'X-HTTP-Method-Override: QUERY' \\\n` +
      `  -H 'Accept: ${CARD_JSON}' \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      `  -H 'Authorization: ${jwt}' \\\n` +
      `  -d '${shellSafeBody}'\n`,
    );
    return;
  }

  // Realm requires QUERY method; use POST + X-HTTP-Method-Override: QUERY
  // (the pattern used by boxel-cli-client.ts in the monorepo for the same
  // endpoint — portable across all Node fetch implementations).
  const res = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      Accept: CARD_JSON,
      'Content-Type': 'application/json',
      'X-HTTP-Method-Override': 'QUERY',
      Authorization: jwt,
    },
    body: JSON.stringify(query),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}`);
    if (text) console.error(text);
    process.exit(1);
  }

  if (options.ids || options.count) {
    const parsed = JSON.parse(text);
    if (options.count) {
      const n = parsed?.meta?.page?.total ?? parsed?.data?.length ?? 0;
      process.stdout.write(`${n}\n`);
      return;
    }
    // --ids: one id per line
    const ids = (parsed?.data ?? []).map((r: any) => r.id).filter(Boolean);
    for (const id of ids) process.stdout.write(id + '\n');
    if (!options.quiet) console.error(`(${ids.length} ids · ${res.status})`);
    return;
  }

  if (options.output) {
    fs.writeFileSync(options.output, text);
    if (!options.quiet) console.error(`Wrote ${text.length} bytes to ${options.output}`);
  } else {
    process.stdout.write(text);
    if (!text.endsWith('\n')) process.stdout.write('\n');
    if (!options.quiet) console.error(`(${res.status} ${res.statusText})`);
  }
}

// ─── Subcommand: atomic — batch add/update/remove ───────────────────
// Body is a JSON document with `atomic:operations` array. Each op is
// `{op: 'add'|'update'|'remove', href: '<path>', data?: {...}}`.
// The realm applies them transactionally via POST /_atomic.
//
// Example body:
//   { "atomic:operations": [
//       { "op": "add", "href": "./Note/n1.json", "data": {...} },
//       { "op": "update", "href": "./Note/n2.json", "data": {...} },
//       { "op": "remove", "href": "./Note/n3.json" }
//   ]}
// ─────────────────────────────────────────────────────────────────────
export async function cardAtomicCommand(
  realmRef: string,
  options: CommonOptions,
): Promise<void> {
  const { realmUrl, jwt } = await authenticate(realmRef, options.quiet);
  const body = await readBody(options);
  const url = `${realmUrl}_atomic`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: API_JSON,
      'Content-Type': API_JSON,
      Authorization: jwt,
    },
    body: JSON.stringify(body),
  });
  await emitResult(res, options);
}

// ─── Subcommand: token — emit JWT for direct curl usage ──────────────
// Useful for scripts that want to avoid per-call Node startup. Prints
// `realm_url jwt` to stdout (space-separated) so shells can:
//   read realm jwt < <(boxel card token <realmRef> --quiet)
// or just `eval $(boxel card token <realmRef> --shell)` for
// JWT=... REALM=... exports.
export async function cardTokenCommand(
  realmRef: string,
  options: CommonOptions & { shell?: boolean },
): Promise<void> {
  const { realmUrl, jwt } = await authenticate(realmRef, options.quiet);
  if ((options as any).shell) {
    process.stdout.write(`REALM=${JSON.stringify(realmUrl)}\nJWT=${JSON.stringify(jwt)}\n`);
  } else {
    process.stdout.write(`${realmUrl} ${jwt}\n`);
  }
}

// ─── Response emitter ────────────────────────────────────────────────

async function emitResult(res: Response, options: CommonOptions): Promise<void> {
  const text = await res.text();
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}`);
    if (text) console.error(text);
    process.exit(1);
  }
  if (options.output) {
    fs.writeFileSync(options.output, text);
    if (!options.quiet) console.error(`Wrote ${text.length} bytes to ${options.output}`);
  } else {
    // body to stdout; status info to stderr so stdout stays parseable
    process.stdout.write(text);
    if (!text.endsWith('\n')) process.stdout.write('\n');
    if (!options.quiet) console.error(`(${res.status} ${res.statusText})`);
  }
}

async function handleFailure(res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  console.error(`${res.status} ${res.statusText}`);
  if (text) console.error(text);
  process.exit(1);
}

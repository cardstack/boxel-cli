# Changelog

All notable changes to `boxel-cli`. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

## 1.1.0 — 2026-04-20

Command-surface restructure plus the two regressions @backspace caught in his PR #15 review. Minor version bump because command names and default paths change in user-visible ways.

### New

- **`boxel doctor` parent command** groups maintenance tasks: `doctor repair-realm`, `doctor repair-realms`, `doctor consolidate-workspaces`, `doctor force-reindex`. Keeps the root command tree focused on day-to-day sync operations.
- **`boxel workspace-list`** (formerly `boxel list`) lists Boxel workspaces the active profile can access. `boxel list` stays as a shorthand alias.
- **`boxel realms <subcommand>`** — positional subcommands replace the old flag-based interface. `boxel realms add ./path`, `realms remove ./path`, `realms init`, `realms list`, `realms llm`. `boxel realms` with no args shows the list.
- **Default workspace root at `~/boxel-workspaces/<domain>/<owner>/<realm>/`.** `boxel pull <url>` now works without a local-dir argument — it derives a canonical path from the URL and creates the directory. `doctor consolidate-workspaces` scans `~/boxel-workspaces/` by default.
- Terminology discipline across docs and help text: **realm** = the server-side thing a URL points at; **workspace** = the Matrix-level organizational unit visible in the Boxel UI.

### Fixed

- **`--fix-index` was on by default, opposite of what PR #15 advertised.** Commander's `.option('--no-fix-index')` makes the underlying boolean default to `true`. Running `boxel doctor repair-realm <url>` silently rewrote `index.json` / `cards-grid.json` even on realms with customized index files (caught by @backspace on the Checkly-prerendered realm that lost its custom index). Flipped to `.option('--fix-index')` — now opt-in. Added regression tests that exercise commander parsing directly.
- **Pull path extraction broke for published realms without an owner segment.** `https://realms-staging.stack.cards/boxel-homepage/` (1 segment) wrote to `.../boxel-homepage/boxel-homepage` (duplicated); `https://gabbro.staging.boxel.build/` (0 segments) wrote to `.../unknown-owner/workspace` (invented placeholders). The layout now adapts to the URL: 0 segments → `<host>/`, 1 segment → `<host>/<realm>/`, 2+ segments → `<host>/<owner>/<realm>/` (unchanged). `findManifestPaths()` walks 2-level layouts so legacy-path detection still works after the shape change.
- **`track --push` showed "Push failed" with no detail on batch errors.** Now surfaces the underlying errors (e.g. `HTTP 413: Payload Too Large`) so you can tell a transient server problem from a size limit.
- **`boxel realms remove <path>`** used to succeed silently on a path not in the config. Now errors with a clear "realm not found" message.
- **Realm folder naming** now uses the full realm server hostname (no domain normalization). Prevents staging/production collisions when two realms share the owner/realm parts.

### Changed (breaking)

- **`boxel realms --add/--init/--remove/--llm` flag form removed.** PR #15 kept these as hidden aliases; per @backspace's review ("we might as well make a clean break as this is not officially released") they're gone. Use positional subcommands.
- **`boxel doctor force-reindex`** replaces the top-level `touch` command semantics when used as a diagnostic; the plain `touch` command stays for everyday single-file re-indexing.

### For contributors

- New `test/commands/repair.test.ts` regression tests for commander flag parsing — catches the `--no-fix-index` default-inversion bug at the commander layer (the previous tests only checked the handler's `options.fixIndex ?? false` fallback, which ran after commander had already set the bad default).
- New `test/lib/workspace-paths.test.ts` cases for 0-segment and 1-segment URLs.
- Removed dead `realmsCommand()` legacy dispatcher and `RealmsOptions` interface from `src/commands/realms.ts`.

---

## 1.0.2 — 2026-04-20

Low-risk ports from `@cardstack/boxel-cli` (the official package in the Boxel monorepo). No user-visible command changes; architectural alignment + mild speedups.

### New

- `'local'` environment — a Matrix ID ending in `:localhost` now resolves to `Environment = 'local'` instead of `'unknown'`. Env labels get matching `'localhost'` / `'🏠 localhost'` cases. Enables running the CLI against a locally-spawned realm-server.
- `resetProfileManager()` — nulls the module-level singleton so tests can start fresh between runs. Purely additive.

### Changed

- Concurrent remote fetches now capped at **10** via `p-limit`. `getRemoteFileList()` parallelizes subdirectory walks with the limiter wrapping only the single HTTP GET (not the recursion), so slots free as fetches return and deep trees can't deadlock on waiting-parent-waiting-child cycles. Deep workspaces should walk faster on `pull` / `sync` / `status`, with concurrency capped at 10.

### For contributors

- New `src/lib/colors.ts` — single source of truth for all ANSI escape codes. 7 files (5 commands + 2 libs) migrated from inline const blocks to imports. Adding a new command now uses the shared palette instead of copying 8 ANSI lines.

---

## 1.0.1 — 2026-04-20

### New

- `boxel push --batch [--batch-size N]` — atomic bulk upload. Definitions upload individually in dependency order (so FieldDefs land before CardDefs that contain them); instances batch through `/_atomic` in groups of N (default 10). Faster and quieter than per-file POST on pushes of 50+ files, and reduces UI re-indexing churn.
- `boxel pull <url> ./local` writes `.boxel-sync.json` automatically after a fresh download. You can now run `boxel sync .` immediately against a just-pulled directory with no manual intermediate step.

### Fixed

- **Binary upload corruption.** Images, fonts, PDFs, and other non-text files were being routed through the `/_atomic` JSON endpoint with text encoding, corrupting the bytes. Binary files now take the per-file POST path with `application/octet-stream`.
- **Plain-text file rejection.** `.md`, `.csv`, `.yaml`, `.xml`, and `.txt` uploads were being rejected by the realm's module compiler as "invalid source". Plain-text files now take the per-file POST path with their true MIME type.
- **Manifest shape drift between push and pull.** `push` and `pull` had diverged on the shape of `.boxel-sync.json`. Mixed-command workflows (pull → push or pull → sync → push) could mark every file as changed on the next run. All three commands now use one canonical shape; `push` migrates the pre-1.0.1 bare-string format on read.
- **Partial-failure batch marks files as synced.** In `--batch` mode, the manifest was updated for every file in a batch whenever any file succeeded, even if some of them had failed. Failed uploads could be silently stranded without retry. The manifest now tracks only files that successfully uploaded; failures stay out and get retried on the next run.
- **`boxel --version` reported wrong number.** The CLI had a hardcoded version string that drifted from `package.json`. Version is now sourced from `package.json` at runtime.
- **`--batch-size` silently accepted garbage.** `--batch-size abc` or `--batch-size -5` used to flow through as `NaN` / negative and cause weird behavior downstream. Non-positive-integer input now fails fast with a clear error.

### For contributors

- New `src/lib/content-type.ts` — single source of truth mapping file extension → MIME type → upload-path decision. Any extension you add for atomic-compatibility should also go here.
- New drift-guards section in `.gitignore` — prevents Boxel platform docs, workspace dirs, and other content that commonly ends up at the repo root from leaking into commits.
- `AGENTS.md` now documents the content-type routing table (file class → path → headers) and the canonical manifest shape, so future additions to `batch-upload.ts` or any manifest-touching command have one reference.

---

## 1.0.0 — 2026-02-13

Initial public release. Core sync, push, pull, watch, track, history, profiles, multi-realm config, realm repair, share/gather GitHub workflow, skill-based Claude Code integration.

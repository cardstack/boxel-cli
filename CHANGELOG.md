# Changelog

All notable changes to `boxel-cli`. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html).

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

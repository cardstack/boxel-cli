# Realm Repair Workflow

This document codifies the built-in realm repair process so no ad-hoc scripts are needed.

## Purpose

Repair a realm that has:
- missing or corrupted `.realm.json` fields (`name`, `iconURL`, `backgroundURL`)
- broken `index.json` to `cards-grid` relationship
- missing or malformed `cards-grid.json`
- stale Matrix account data (`app.boxel.realms`)

When `index.json` or `cards-grid.json` must be replaced, existing file content is preserved to non-conflicting backup files (timestamped `*.backup-...json`) before writing the fixed home cards.

## Commands

```bash
# Repair one realm
boxel repair-realm <workspace-url>

# Batch repair all realms for the active profile owner
boxel repair-realms
```

## Single-Realm Options

```bash
boxel repair-realm <url> \
  --match-endpoint \
  --reconcile-matrix \
  --dry-run
```

- `--match-endpoint`: force display name from endpoint slug (for example, `odd-sheep` -> `Odd Sheep`)
- `--reconcile-matrix`: upsert/remove this specific realm URL in Matrix `app.boxel.realms`
- `--no-fix-index`: skip `index.json` and `cards-grid.json` repairs
- `--no-touch-index`: skip cache-busting mutation in `index.json`
- `--include-personal`: include the special `personal` realm (excluded by default)

## Batch Options

```bash
boxel repair-realms \
  --owner ctse \
  --include-personal \
  --dry-run
```

- `--owner`: repair realms for specific owner (default is active profile user)
- `--no-reconcile-matrix`: skip owner-wide Matrix list reconciliation
- `--force`: overwrite existing metadata values, not just missing/bad ones

## Notes

- Batch mode reconciles Matrix account data by keeping non-owner realms as-is and rewriting owner realm entries to match repaired/access-verified realms.
- `index.json` touch writes `data.meta._touched` with a timestamp to force re-index/cache refresh.

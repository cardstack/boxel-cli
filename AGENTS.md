# AGENTS.md - Boxel CLI Codex Guidance

This file adapts `.claude/CLAUDE.md` for Codex agents working in this repo.

## Repository
- Official repo: [cardstack/boxel-cli](https://github.com/cardstack/boxel-cli)
- Primary project root: `/Users/chris/Documents/GitHub/boxel-cli/boxel-cli`

## Running Commands
- Build once: `npm install && npm run build`
- Normal usage: `npx boxel <command>`
- Development mode (no rebuild after code changes): `npm run dev -- <command>`

## High-Priority Safety Rules
1. Create a checkpoint before destructive operations:
   - `boxel history . -m "Before destructive operation"`
2. After restore, always sync with local preference:
   - `boxel history . -r <checkpoint>`
   - `boxel sync . --prefer-local`
3. Stop watch before restore to avoid re-pulling deleted files.
4. When watch is running and you edit files locally, use edit locks:
   - `boxel edit . <file>` before editing
   - `boxel edit . --done <file>` after sync
5. Write clean source code, never compiled wire-format output for `.gts` files.

## Boxel Development Trigger
When tasks involve Boxel card development, automatically consult:
- `.claude/commands/boxel-development.md`

Trigger examples:
- Editing `.gts` card definitions
- Editing card instance `.json`
- Asking for Boxel card patterns/components
- Working in a synced workspace (`.boxel-sync.json` present)

## Core Command Semantics
- `pull`: remote -> local
- `push`: local -> remote
- `sync`: bidirectional conflict resolution
- `track`: local file watching with auto-checkpoints only (does not push)
- `watch`: remote change watching (pulls server changes)
- `repair-realm`: repair one realm metadata + starter cards + optional Matrix reconciliation
- `repair-realms`: batch repair all owned realms and reconcile Matrix realm list

After local edits tracked with `track`, push to server with:
- `boxel sync . --prefer-local`

## Onboarding Flow (When Needed)
If user has no profile configured:
1. `npx boxel profile`
2. `npx boxel profile add` (interactive preferred)
3. `npx boxel list`
4. First sync/pull into local workspace

Security note:
- Prefer interactive password entry or `BOXEL_PASSWORD` env var.
- Avoid plain `-p` password usage in shell history.

## Multi-Realm Guidance
- Configure realms with `boxel realms --add ...`
- Use `boxel realms --llm` for file-placement guidance.
- Heuristic:
  - `.gts` -> code realm (`*.gts` pattern)
  - instances -> realm mapped for card type
  - ambiguous -> default realm

## Boxel URL Handling
Boxel app URLs usually reference private, authenticated content.
- Do not fetch them from the public web.
- Parse card path from URL and locate local synced file instead.
Example:
- URL segment `Document/<id>` maps to local `Document/<id>.json`

## Useful Workflows
### Local dev loop
1. `boxel track .`
2. edit files
3. `boxel sync . --prefer-local`

### Monitor server changes
1. `boxel watch .`
2. inspect checkpoints with `boxel history .`

### Restore workflow
1. stop watch
2. `boxel history . -r <checkpoint>`
3. `boxel sync . --prefer-local`

## Related References
- `.claude/CLAUDE.md`
- `.claude/commands/boxel-development.md`
- `.claude/commands/boxel-file-structure.md`
- `.claude/commands/repair.md`
- `.claude/commands/sync.md`
- `.claude/commands/watch.md`
- `.claude/commands/track.md`
- `.claude/commands/restore.md`
- `.claude/commands/setup.md`

## Notes for Agents Editing This Repo
- Prefer minimal, targeted command changes in `src/commands/*.ts`.
- Validate with local build/tests when feasible.
- Do not modify unrelated generated outputs.

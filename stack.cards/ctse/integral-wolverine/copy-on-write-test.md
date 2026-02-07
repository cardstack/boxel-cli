# Copy-on-Write GTS Update Test

## Hypothesis

When a `.gts` file changes, the Boxel loader invalidates the entire JS app, causing a screen flash/redraw. However, updating a `.json` instance file does **not** trigger this invalidation.

**Goal:** Test if we can update card designs without screen flash by:
1. Creating new GTS versions instead of modifying in place
2. Updating JSON instances to point to the new GTS version

## Test Protocol

### Setup

- **Workspace:** `ctse/integral-wolverine` (staging)
- **Watch mode:** Running with 10s interval
- **Instance:** `RunOffElection/instance-run-off-election.json`
- **GTS versions:** `infographic-1.gts`, `infographic-2.gts`, `infographic-3.gts`, etc.

### Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  ITERATION N                                                │
├─────────────────────────────────────────────────────────────┤
│  1. Copy infographic-N.gts → infographic-(N+1).gts         │
│  2. Make design changes to infographic-(N+1).gts           │
│  3. Sync (uploads new GTS file)                            │
│     → Expected: Screen flash (new module loaded)           │
│  4. Update JSON adoptsFrom to point to infographic-(N+1)   │
│  5. Sync (uploads JSON only)                               │
│     → Expected: NO flash (just data change)                │
│  6. Observe behavior                                       │
└─────────────────────────────────────────────────────────────┘
```

### Phase 1: Initial Setup

1. **Create `infographic-1.gts`**
   - Basic infographic card for election data
   - Fields: title, candidates[], results, sourceUrl
   - Formats: isolated, embedded, fitted

2. **Create `RunOffElection/instance-run-off-election.json`**
   - Sample Georgia Senate runoff data
   - Points to `./infographic-1` as adoptsFrom

3. **Sync and verify** card renders correctly

### Phase 2: First Iteration

1. **Copy** `infographic-1.gts` → `infographic-2.gts`
2. **Improve** `infographic-2.gts`:
   - Better styling
   - Add progress bars for vote percentages
   - Improve fitted layout
3. **Sync** the new GTS file
4. **Update JSON** `adoptsFrom` to `./infographic-2`
5. **Sync** JSON change only
6. **Record:** Did screen flash on step 5?

### Phase 3: Second Iteration

1. **Copy** `infographic-2.gts` → `infographic-3.gts`
2. **Improve** `infographic-3.gts`:
   - Add user-provided suggestions
   - Refine visual design
3. **Sync** the new GTS file
4. **Update JSON** `adoptsFrom` to `./infographic-3`
5. **Sync** JSON change only
6. **Record:** Did screen flash on step 5?

## Expected Results

| Action | Expected Behavior |
|--------|-------------------|
| Sync new GTS file | Screen flash (module invalidation) |
| Sync JSON adoptsFrom change | **NO flash** (data only) |

## Success Criteria

- [ ] JSON-only updates do NOT cause screen flash
- [ ] Card correctly switches to new design after JSON update
- [ ] Old GTS versions remain available (rollback possible)

## Notes

- Keep old GTS versions for rollback capability
- Version naming: `infographic-1.gts`, `infographic-2.gts`, etc.
- JSON `adoptsFrom` uses relative module paths: `./infographic-1`, `./infographic-2`

## Commands

```bash
# Watch the workspace
boxel watch @ctse/integral-wolverine -i 10

# Sync changes
boxel sync . --prefer-local

# Check status
boxel status .
```

---

**Test started:** 2026-02-05
**Status:** Ready to begin Phase 1

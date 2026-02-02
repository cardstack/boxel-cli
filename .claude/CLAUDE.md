# Boxel CLI - Claude Code Integration

## Auto-Activate Boxel Development Skill

**IMPORTANT:** When the user is doing ANY of the following, automatically read and follow `.claude/commands/boxel-development.md`:

- Creating or editing `.gts` files (card definitions)
- Creating or editing `.json` card instances
- Asking about Boxel patterns, cards, or components
- "Vibe coding" or prototyping Boxel cards
- Working in a synced Boxel workspace (has `.boxel-sync.json`)
- Asking to create, build, or design anything in Boxel

**How to activate:** Read the skill file at the start of the task:
```
Read .claude/commands/boxel-development.md
```

The skill contains comprehensive Boxel development guidance including CardDef/FieldDef patterns, templates, styling, and best practices.

---

**When a user opens this repo, check if they need onboarding first!**

## Onboarding Flow

When you detect a new user (no `.env` file or first interaction), guide them through setup:

### Step 1: Check Environment
```bash
# Check if .env exists and has content
cat .env 2>/dev/null || echo "NOT_CONFIGURED"
```

### Step 2: Prompt for Environment Choice
If not configured, ask:

```
Welcome to Boxel CLI! Let's get you set up.

Which environment do you want to use?

1. **Production** (app.boxel.ai) - Live Boxel
2. **Staging** (realms-staging.stack.cards) - Development/testing

You'll need your Boxel username and password (same as web login).

Your username is your Boxel handle (e.g., `aallen90`, `ctse`). Find it in:
- **Account panel**: shown as `@username:stack.cards`
- **Workspace URLs**: `app.boxel.ai/username/workspace-name`
```

### Step 3: Create .env
Based on their choice:

**Production:**
```env
MATRIX_URL=https://matrix.boxel.ai
MATRIX_USERNAME=<ask for username>
MATRIX_PASSWORD=<ask for password>
REALM_SERVER_URL=https://app.boxel.ai/
```

**Staging:**
```env
MATRIX_URL=https://matrix-staging.stack.cards
MATRIX_USERNAME=<ask for username>
MATRIX_PASSWORD=<ask for password>
REALM_SERVER_URL=https://realms-staging.stack.cards/
```

### Step 4: Verify & List Workspaces
```bash
npm install
npm run dev -- list
```

### Step 5: First Sync
Help them sync their first workspace:
```bash
npm run dev -- sync @username/workspace
```

---

## Available Skills

### `/watch` - Smart Watch
Starts `boxel watch` with intelligent interval based on context:
- **Active development** (5s interval, 3s debounce): When editing files
- **Monitoring** (30s interval, 10s debounce): Background observation
- **Quick feedback** (10s interval, 5s debounce): Testing changes

### `/restore` - Restore Checkpoint
Complete restore workflow:
1. Shows history
2. Restores to checkpoint (properly deletes newer files)
3. Syncs deletions to server with `--prefer-local`
4. Optionally restarts watch

### `/sync` - Smart Sync
Context-aware bidirectional sync:
- After local edits → `--prefer-local`
- After server changes → `--prefer-remote`
- After restore → `--prefer-local` (essential for syncing deletions)

---

## Commands Reference

### Status & Checking
```bash
boxel status .                    # Check sync status
boxel status --all                # Check all workspaces
boxel status . --pull             # Auto-pull remote changes
boxel check ./file.json --sync    # Check single file
```

### Sync
```bash
boxel sync .                      # Interactive sync
boxel sync . --prefer-local       # Keep local + sync deletions
boxel sync . --prefer-remote      # Keep remote
boxel sync . --prefer-newest      # Keep newest version
boxel sync . --delete             # Sync deletions both ways
boxel sync . --dry-run            # Preview only
```

### Watch
```bash
boxel watch .                     # Default: 30s interval, 5s debounce
boxel watch . -i 5 -d 3           # Active: 5s interval, 3s debounce
boxel watch . -q                  # Quiet mode
```

### History & Restore
```bash
boxel history .                   # View checkpoints
boxel history . -r                # Interactive restore
boxel history . -r 3              # Quick restore to #3
boxel history . -r abc123         # Restore by hash
```

### Skills
```bash
boxel skills --refresh            # Fetch skills from Boxel
boxel skills --list               # List all available skills
boxel skills --enable "Name"      # Enable a skill
boxel skills --disable "Name"     # Disable a skill
boxel skills --export ./project   # Export as Claude commands
```

### Other
```bash
boxel list                        # List workspaces
boxel create endpoint "Name"      # Create workspace
boxel pull <url> ./local          # One-way pull
boxel push ./local <url>          # One-way push
```

### `/boxel-development` - Default Vibe Coding Skill
The **Boxel Development** skill is auto-enabled for vibe coding. It provides comprehensive guidance for:
- Card definitions (.gts files)
- Card instances (.json files)
- Boxel patterns and best practices

### `/boxel-file-structure` - File Organization Rules
Reference for local file organization:
- Directory naming: definitions (`kebab-case.gts`), instances (`PascalCase/`)
- Module paths: relative to JSON location (`../card` from subdirectory)
- JSON structure for card instances

### `/skills` - Manage Additional Skills
Fetch and manage AI instruction cards from Boxel:
```bash
boxel skills --refresh       # Fetch latest from Boxel
boxel skills --list          # See available skills
boxel skills --enable "X"    # Enable additional skills
boxel skills --export .      # Re-export to .claude/commands/
```

---

## Key Workflows

### Active Development Session
```bash
/watch                            # Starts with 5s interval
# ... edit in Boxel UI or locally ...
/sync                             # Push/pull changes
```

### Undo Server Changes (Restore)
```bash
boxel history .                   # Find checkpoint
boxel history . -r 3              # Restore to #3
boxel sync . --prefer-local       # ESSENTIAL: sync deletions to server
```

Or simply:
```
/restore 3
```

### Monitor Server While Working
```bash
/watch                            # Detects monitoring context (30s)
# Checkpoints created automatically
boxel history .                   # View what changed
```

---

## Critical Patterns

### 1. Stop Watch Before Restore
Watch will re-pull deleted files if running during restore:
```bash
# Stop watch first (Ctrl+C or kill process)
boxel history . -r 3
boxel sync . --prefer-local
```

### 2. Always Use --prefer-local After Restore
This syncs local deletions to the server:
```bash
boxel history . -r 3              # Deletes files locally
boxel sync . --prefer-local       # Deletes files on server
```

### 3. Debouncing Groups Rapid Changes
Watch waits for changes to settle:
- Change detected → timer starts
- More changes → timer resets
- Timer expires → single checkpoint with all changes

### 4. Checkpoint Classification
- `[MAJOR]` - New files, deleted files, .gts changes, >3 files
- `[minor]` - Small updates to existing .json files
- `LOCAL` (↑) - Changes you pushed
- `SERVER` (↓) - External changes from web UI

---

## File Structure

```
workspace/
├── .boxel-sync.json      # Sync manifest (hashes, mtimes)
├── .boxel-history/       # Git-based checkpoint history
├── .realm.json           # Workspace config
├── index.json            # Workspace index
├── *.gts                 # Card definitions
└── CardName/
    └── *.json            # Card instances
```

---

## Workspace References

Commands accept:
- `.` - Current directory (needs `.boxel-sync.json`)
- `./path` - Local path
- `@user/workspace` - e.g., `@username/personal`
- `https://...` - Full URL

---

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/_mtimes` | GET | File modification times |
| `/<path>` | GET | Download file |
| `/<path>` | POST | Upload file |
| `/<path>` | DELETE | Delete file |

Headers:
- `Authorization`: JWT from Matrix auth
- `Accept`: `application/vnd.card+source` or `application/vnd.api+json`

---

## Conflict Resolution

| Local | Remote | Action |
|-------|--------|--------|
| Changed | Unchanged | Push |
| Unchanged | Changed | Pull |
| Changed | Changed | Conflict → use strategy |
| Deleted | Changed | `--prefer-local` deletes remote |
| Changed | Deleted | `--prefer-remote` deletes local |

---

## Troubleshooting

### "Authentication failed"
- Check credentials in `.env`
- Verify you can log into Boxel web
- For staging: use `matrix-staging.stack.cards`

### "No workspace found"
- Run `boxel list` to see workspaces
- Use full URL for first sync

### Files keep reverting after restore
- Stop watch before restoring
- Use `boxel sync . --prefer-local` after

### Watch not detecting changes
- Check interval setting
- Verify server URL
- Check JWT auth

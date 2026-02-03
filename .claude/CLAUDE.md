# Boxel CLI - Claude Code Integration

## How to Run Boxel Commands

**IMPORTANT:** In this development repo, the `boxel` CLI is not globally installed. Always run commands using:

```bash
npm run dev -- <command> [args]
```

Examples:
```bash
npm run dev -- sync .                    # NOT: boxel sync .
npm run dev -- history ./workspace       # NOT: boxel history ./workspace
npm run dev -- milestone ./workspace 1 -n "Name"
```

The `--` separates npm arguments from the CLI arguments. All documentation below shows `boxel <command>` for brevity, but always use `npm run dev -- <command>` when executing.

---

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
npm run dev -- sync @username/workspace ./workspace-name
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
boxel watch                       # Watch all configured realms (from .boxel-workspaces.json)
boxel watch .                     # Watch single workspace
boxel watch . ./other-realm       # Watch multiple realms simultaneously
boxel watch . -i 5 -d 3           # Active: 5s interval, 3s debounce
boxel watch . -q                  # Quiet mode
```

**Multi-realm watching:** Useful when code lives in one realm and data in another. Each realm gets its own checkpoint tracking and debouncing.

### Realms (Multi-Realm Configuration)
```bash
boxel realms                      # List configured realms
boxel realms --init               # Create .boxel-workspaces.json
boxel realms --add ./path         # Add a realm
boxel realms --add ./code --purpose "Card definitions" --patterns "*.gts" --default
boxel realms --add ./data --purpose "Data instances" --card-types "BlogPost,Product"
boxel realms --llm                # Output LLM guidance for file placement
boxel realms --remove ./path      # Remove a realm
```

**File placement guidance:** The `--llm` output tells Claude which realm to use for different file types and card types.

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

### Share & Gather (GitHub Workflow)
```bash
boxel share . -t /path/to/repo -b branch-name --no-pr   # Share to GitHub repo
boxel gather . -s /path/to/repo                          # Pull from GitHub repo
```

**Share** copies workspace state to a GitHub repo branch:
- Preserves repo-level files (package.json, LICENSE, README, etc.)
- Skips realm-specific files (.realm.json, index.json, cards-grid.json)
- Creates branch and commits changes

**Gather** pulls changes from GitHub back to workspace:
- Symmetric to share
- Preserves workspace's realm-specific files

**Pushing to GitHub:** Use GitHub Desktop to push branches (no CLI auth configured).
After share creates the branch locally, open GitHub Desktop and push.

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

### Share Milestone to GitHub
```bash
boxel share . -t /path/to/boxel-home -b boxel/feature-name --no-pr
# Then push via GitHub Desktop
```

### Gather Updates from GitHub
```bash
boxel gather . -s /path/to/boxel-home
boxel sync . --prefer-local       # Push gathered changes to Boxel server
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

### Multi-Realm Development
When working with multiple realms (e.g., code + data separation):

```bash
# Configure realms once
boxel realms --add ./code-realm --purpose "Card definitions" --patterns "*.gts" --default
boxel realms --add ./data-realm --purpose "Content instances" --card-types "BlogPost,Product"

# Watch all configured realms
boxel watch

# Check where to put a new file
boxel realms --llm
```

**File placement heuristics:**
- `.gts` files → realm with `*.gts` pattern (usually code realm)
- Card instances → realm configured for that card type
- Ambiguous → use the default realm

---

## Critical Patterns

### 0. ALWAYS Write Source Code, Never Compiled Output
When editing `.gts` files, **always write clean idiomatic source code**:
```gts
// CORRECT - Clean source
export class MyCard extends CardDef {
  static fitted = class Fitted extends Component<typeof MyCard> {
    <template>
      <div class="container">...</div>
      <style scoped>
        .container { ... }
      </style>
    </template>
  };
}
```

**NEVER** write or edit:
- Compiled JSON blocks (`"block": "[[[10,0]..."`)
- Base64-encoded CSS imports (`./file.gts.CiAg...`)
- Wire format template arrays

The server compiles source to these formats. If you see them, the file was pulled from server - rewrite it as clean source.

### 0.5. Edit Lock Before Modifying Files
When editing files locally while watch is running, use edit lock to prevent watch from overwriting your changes:
```bash
boxel edit . grammy-gallery.gts       # Lock file before editing
# ... make your edits ...
boxel sync . --prefer-local           # Push your changes
boxel touch . Instance/file.json      # Force re-index
boxel edit . --done grammy-gallery.gts  # Release lock
```

**Quick commands:**
```bash
boxel edit . --list                   # See what's locked
boxel edit . --clear                  # Clear all locks
boxel edit . --done                   # Release all locks
```

**Why:** Watch mode pulls remote changes which can overwrite local edits. Edit lock tells watch to skip those files.

### 0.5. Touch Instance After Remote .gts Update
When you update a `.gts` card definition file remotely (via sync/push), touch an instance file to force re-indexing:
```bash
boxel touch . CardName/instance.json  # Touch specific instance
boxel touch .                         # Or touch all files
```
**Why:** The realm server may not re-index the definition until an instance using it is touched.

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

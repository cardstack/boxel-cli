# Boxel CLI

Bidirectional sync between your local editor and [Boxel](https://boxel.ai) workspaces.

**Edit Boxel cards locally with your favorite IDE, sync changes instantly, and collaborate with the web UI.**

## Quick Start

```bash
# Clone and install
git clone https://github.com/cardstack/boxel-cli.git
cd boxel-cli
npm install

# Set up your environment
cp .env.example .env
# Edit .env with your Boxel credentials

# List your workspaces
npm run dev -- list

# Sync a workspace
npm run dev -- sync @username/workspace
```

## Setup

### 1. Get Your Credentials

You need a Boxel account. Sign up at [boxel.ai](https://boxel.ai) if you haven't already.

Your **username** is your Boxel handle (e.g., `aallen90`, `ctse`). You can find it:
- In your **Account panel**: shown as `@username:stack.cards`
- In your **workspace URLs**: `app.boxel.ai/username/workspace-name`

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**For Production (app.boxel.ai):**
```env
MATRIX_URL=https://matrix.boxel.ai
MATRIX_USERNAME=your-username
MATRIX_PASSWORD=your-password
REALM_SERVER_URL=https://app.boxel.ai/
```

**For Staging (realms-staging.stack.cards):**
```env
MATRIX_URL=https://matrix-staging.stack.cards
MATRIX_USERNAME=your-username
MATRIX_PASSWORD=your-password
REALM_SERVER_URL=https://realms-staging.stack.cards/
```

### 3. Verify Setup

```bash
npm run dev -- list
```

You should see your workspaces listed.

## Commands

### Check Status
```bash
boxel status .              # Current workspace status
boxel status --all          # All your workspaces
boxel status . --pull       # Pull remote changes
```

### Sync Changes
```bash
boxel sync .                # Bidirectional sync
boxel sync . --prefer-local # Keep local on conflicts
boxel sync . --prefer-remote # Keep remote on conflicts
```

### Watch for Changes
```bash
boxel watch .               # Monitor server, auto-checkpoint
boxel watch . -i 5          # Check every 5 seconds
```

### View & Restore History
```bash
boxel history .             # View checkpoints
boxel history . -r 3        # Restore to checkpoint #3
```

### Other Commands
```bash
boxel list                  # List workspaces
boxel create my-app "My App" # Create workspace
boxel pull <url> ./local    # One-way pull
boxel push ./local <url>    # One-way push
```

## Typical Workflow

### 1. Clone a Workspace
```bash
# First time: sync with explicit URL
boxel sync ./my-workspace https://app.boxel.ai/username/my-workspace/
```

### 2. Edit Locally
Open the workspace in your IDE. Edit `.gts` (card definitions) or `.json` (instances).

### 3. Sync Changes
```bash
boxel sync .
```

### 4. Monitor Server Changes
```bash
boxel watch .
# Now any changes made in Boxel web UI are auto-pulled
```

### 5. Restore if Needed
```bash
boxel history .           # See what changed
boxel history . -r 2      # Restore to checkpoint #2
boxel sync . --prefer-local # Push restoration to server
```

## Using with Claude Code

This repo includes Claude Code integration for AI-assisted development.

### Available Skills
- `/watch` - Start smart watch with auto-detected interval
- `/restore` - Complete restore workflow
- `/sync` - Context-aware sync

### Onboarding
When you open this repo in Claude Code, it will:
1. Detect if `.env` is configured
2. Prompt you to choose staging or production
3. Guide you through your first sync

See `.claude/CLAUDE.md` for full documentation.

## File Structure

```
workspace/
├── .boxel-sync.json      # Sync manifest
├── .boxel-history/       # Checkpoint history (git-based)
├── .realm.json           # Workspace config
├── *.gts                 # Card definitions
└── CardName/*.json       # Card instances
```

## Workspace References

Commands accept these formats:
- `.` - Current directory
- `./path` - Local path
- `@user/workspace` - By name (e.g., `@aallen90/personal`)
- `https://...` - Full URL

## Conflict Resolution

| Scenario | Flag | Result |
|----------|------|--------|
| Keep local changes | `--prefer-local` | Overwrite remote |
| Keep remote changes | `--prefer-remote` | Overwrite local |
| Keep newest | `--prefer-newest` | Compare timestamps |
| Sync deletions | `--delete` | Delete on both sides |

## Troubleshooting

### "Authentication failed"
- Check your credentials in `.env`
- Verify you can log into Boxel web UI
- For staging, use `matrix-staging.stack.cards`

### "No workspace found"
- Run `boxel list` to see available workspaces
- Use full URL for first-time sync

### Files keep reverting after restore
- Stop `boxel watch` before restoring
- Use `boxel sync . --prefer-local` after restore

## Development

```bash
npm install
npm run dev -- <command>   # Run in dev mode
npm run build              # Build
npm test                   # Test
npm run lint               # Lint
```

## License

MIT - See [LICENSE](LICENSE)

## Contributing

PRs welcome! Please ensure:
- Code passes linting
- New features have documentation
- Breaking changes are noted

## Links

- [Boxel](https://boxel.ai) - Web application
- [Documentation](https://boxel.ai/docs) - Full Boxel docs
- [Discord](https://discord.gg/boxel) - Community

# Track Skill

Start `boxel track` to monitor local file changes and create checkpoints automatically.

## When to Use Track

Use **track** when you're editing files locally (in IDE, with AI agent, etc.) and want automatic backups:
- Working in VS Code, Cursor, or other IDE
- AI agent is editing files
- You want checkpoint history of your work

**Track vs Watch:**
| Command | Symbol | Direction | Purpose |
|---------|--------|-----------|---------|
| `track` | ⇆ | Local edits → Checkpoints | Backup your work as you edit |
| `watch` | ⇅ | Server → Local | Pull external changes from Boxel UI |

## Commands

```bash
# Start tracking (default: 3s debounce, 10s min interval)
boxel track .

# Custom timing (5s debounce, 30s between checkpoints)
boxel track . -d 5 -i 30

# Quiet mode (only show checkpoints)
boxel track . -q

# Stop all track/watch processes
boxel stop
```

## The Track → Sync Workflow

**IMPORTANT:** Track only creates local checkpoints. To push changes to the Boxel server:

```bash
# 1. Track creates checkpoints as you edit
boxel track .

# 2. When ready to push to server, sync with --prefer-local
boxel sync . --prefer-local
```

Track does NOT automatically sync to the server. This is intentional - it lets you:
- Work offline with local backups
- Batch multiple edits before pushing
- Review changes before they go live

## Context Detection

When invoked, consider:

### Standard Development (3s debounce, 10s interval)
- Normal editing workflow
- Balanced between checkpoint frequency and overhead

### Fast Iteration (2s debounce, 5s interval)
- Rapid prototyping
- User says "track closely" or "capture everything"

### Background Tracking (5s debounce, 30s interval)
- Long editing sessions
- User says "just backup" or "light tracking"

## Response Format

When invoked:
1. Confirm workspace directory
2. Start track with appropriate settings
3. **Remind user to sync when ready to push changes**

Example:
```
Starting track in the current workspace (3s debounce, 10s interval).
Checkpoints will be created automatically as you save files.

Remember: Track creates LOCAL checkpoints only.
When ready to push changes to Boxel server:
  boxel sync . --prefer-local

Use Ctrl+C to stop tracking, or `boxel stop` from another terminal.
```

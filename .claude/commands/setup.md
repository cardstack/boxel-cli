# Setup / Onboarding Skill

Guide new users through Boxel CLI setup.

## Trigger
Run this automatically when:
- User first opens the repo
- No `.env` file exists
- User asks about setup or getting started

## Flow

### 1. Check Current State
```bash
cat .env 2>/dev/null || echo "NOT_CONFIGURED"
npm list 2>/dev/null || echo "NOT_INSTALLED"
```

### 2. Ask Environment Choice
Present options:

**Production (app.boxel.ai)**
- For live Boxel usage
- Your real workspaces

**Staging (realms-staging.stack.cards)**
- For development/testing
- Experimental features

### 3. Collect Credentials
Ask for:
- **Username**: Their Boxel handle (e.g., `aallen90`, `ctse`). Found in Account panel as `@username:stack.cards` or in workspace URLs like `app.boxel.ai/username/workspace-name`
- **Password**: Same as Boxel web login

### 4. Create .env File

**Production:**
```env
MATRIX_URL=https://matrix.boxel.ai
MATRIX_USERNAME=<username>
MATRIX_PASSWORD=<password>
REALM_SERVER_URL=https://app.boxel.ai/
```

**Staging:**
```env
MATRIX_URL=https://matrix-staging.stack.cards
MATRIX_USERNAME=<username>
MATRIX_PASSWORD=<password>
REALM_SERVER_URL=https://realms-staging.stack.cards/
```

### 5. Install & Verify
```bash
npm install
npm run dev -- list
```

### 6. First Sync
Help them sync a workspace:
```bash
npm run dev -- sync @username/workspace
```

## Success Message
```
Setup complete! You can now:
- `boxel list` - See your workspaces
- `boxel sync @username/workspace` - Sync a workspace
- `boxel watch .` - Monitor for changes
- `boxel history .` - View/restore checkpoints

For AI-assisted development, try:
- `/watch` - Smart watch with auto intervals
- `/sync` - Context-aware sync
- `/restore` - Undo changes
```

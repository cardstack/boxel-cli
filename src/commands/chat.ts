// ─────────────────────────────────────────────────────────────────────
// `boxel chat <roomId>` — CLI ↔ Card via Matrix events (prototype)
// ─────────────────────────────────────────────────────────────────────
// Companion to the nuclear-mosquito realm's CliPresenceDemo card.
// Logs in as the active profile's user, joins the given room, sends
// `app.boxel.bot-trigger` events as the user types, and long-polls
// `/sync` for incoming events. The AI bot ignores non-`m.room.message`
// events (verified in Projects/boxel/packages/ai-bot/main.ts), so this
// channel is quiet by construction.
//
// Event shape is symmetric with the card's SendBotTriggerEventCommand:
//   { type: 'app.boxel.bot-trigger',
//     content: { type: 'cli.message', input: {text, sender}, realm, userId } }
// ─────────────────────────────────────────────────────────────────────
import * as readline from 'node:readline';
import { MatrixClient, type MatrixTimelineEvent } from '../lib/matrix-client.js';
import { getProfileManager, formatProfileBadge } from '../lib/profile-manager.js';
import {
  FG_GREEN,
  FG_MAGENTA,
  FG_YELLOW,
  FG_CYAN,
  DIM,
  RESET,
} from '../lib/colors.js';

const FG_CLI = FG_GREEN; // origin: cli (self-or-other)

const BOT_TRIGGER_TYPE = 'app.boxel.bot-trigger';

// Rotating CQ cards from ctse/nursing-porpoise — each renders nicely
// in a fitted container. Used when --heartbeat is on.
const NURSING_PORPOISE = 'https://realms-staging.stack.cards/ctse/nursing-porpoise';
const HEARTBEAT_URLS: string[] = [
  `${NURSING_PORPOISE}/EventTicketCardCQ/concert`,
  `${NURSING_PORPOISE}/HotelRoomCardCQ/oceanview-suite`,
  `${NURSING_PORPOISE}/NewsCardCQ/breaking`,
  `${NURSING_PORPOISE}/RecipeCardCQ/carbonara`,
  `${NURSING_PORPOISE}/RestaurantMenuItemCQ/seared-duck`,
  `${NURSING_PORPOISE}/StockTickerCardCQ/aero-buy`,
  `${NURSING_PORPOISE}/NbaTradingCard/jalen-brunson-2025-prizm`,
  `${NURSING_PORPOISE}/TradingCard/jalen-brunson`,
  `${NURSING_PORPOISE}/InvoiceCard/inv-2026-002`,
];

export interface ChatOptions {
  realm?: string;
  quiet?: boolean;
  heartbeat?: number; // interval in seconds; 0/undefined = disabled
  keepAibot?: boolean; // default: kick @aibot from the room on join
}

export async function chatCommand(
  roomId: string,
  options: ChatOptions,
): Promise<void> {
  const profileManager = getProfileManager();
  const credentials = await profileManager.getActiveCredentials();
  if (!credentials) {
    throw new Error('No credentials. Run `boxel profile add` first.');
  }
  const { matrixUrl, username, password, profileId } = credentials;

  if (!options.quiet && profileId) {
    console.error(formatProfileBadge(profileId));
  }

  const matrix = new MatrixClient({
    matrixURL: new URL(matrixUrl),
    username,
    password,
  });
  await matrix.login();
  const userId = matrix.getUserId()!;

  // Join the room (idempotent — safe if already joined).
  try {
    await matrix.joinRoom(roomId);
  } catch (e) {
    // Already joined throws on some servers; ignore and keep going.
    if (!options.quiet) {
      console.error(`${DIM}(join: ${(e as Error).message.slice(0, 80)}…)${RESET}`);
    }
  }

  // Kick @aibot from the room unless the caller opted out. The AI bot
  // responds to every m.room.message, costing LLM tokens — we don't
  // want that for a CLI↔card channel. User is room creator (admin via
  // CreateAiAssistantRoomCommand) so has the power level.
  if (!options.keepAibot) {
    const domain = userId.split(':')[1];
    const botUserId = `@aibot:${domain}`;
    try {
      const kicked = await matrix.kickUser(
        roomId,
        botUserId,
        'cli-presence: no AI in this room',
      );
      if (!options.quiet) {
        console.error(
          kicked
            ? `${FG_YELLOW}kicked${RESET} ${botUserId}`
            : `${DIM}(${botUserId} not in room — no-op)${RESET}`,
        );
      }
    } catch (e) {
      if (!options.quiet) {
        console.error(
          `${FG_YELLOW}kick warning: ${(e as Error).message.slice(0, 120)}${RESET}`,
        );
      }
    }
  }

  if (!options.quiet) {
    console.error(`${FG_CYAN}joined${RESET} ${roomId}`);
    console.error(`${DIM}type to send; Ctrl-C to leave${RESET}\n`);
  }

  // Announce arrival.
  await sendBotTrigger(matrix, roomId, userId, options.realm, 'cli.hello', {
    text: `cli online as ${userId}`,
  });

  // Graceful goodbye on SIGINT.
  let cleanupOnce = false;
  const cleanup = async () => {
    if (cleanupOnce) return;
    cleanupOnce = true;
    try {
      await sendBotTrigger(matrix, roomId, userId, options.realm, 'cli.goodbye', {
        text: 'cli offline',
      });
    } catch {
      /* best-effort */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void cleanup();
  });

  // Start sync loop (prints events) and stdin loop (sends events) in
  // parallel. Swallow errors in the sync loop after logging — the CLI
  // keeps running so the user can still send.
  void runSyncLoop(matrix, roomId, userId);
  runStdinLoop(matrix, roomId, userId, options.realm);

  if (options.heartbeat && options.heartbeat > 0) {
    runHeartbeatLoop(matrix, roomId, userId, options.realm, options.heartbeat);
  }
}

function runHeartbeatLoop(
  matrix: MatrixClient,
  roomId: string,
  userId: string,
  realm: string | undefined,
  everySeconds: number,
): void {
  let i = 0;
  const tick = async () => {
    const url = HEARTBEAT_URLS[i % HEARTBEAT_URLS.length]!;
    const label = url.split('/').slice(-2).join('/');
    try {
      await matrix.sendEvent(roomId, BOT_TRIGGER_TYPE, {
        type: 'cli.heartbeat',
        input: {
          text: `heartbeat #${i + 1} → ${label}`,
          sender: userId,
          linkedCardUrl: url,
        },
        realm: realm ?? '',
        userId,
      });
      i++;
    } catch (e) {
      console.error(
        `${FG_YELLOW}heartbeat send error: ${(e as Error).message}${RESET}`,
      );
    }
  };
  // Fire first tick immediately; then on interval.
  void tick();
  setInterval(() => {
    void tick();
  }, everySeconds * 1000);
}

async function sendBotTrigger(
  matrix: MatrixClient,
  roomId: string,
  userId: string,
  realm: string | undefined,
  kind: string,
  input: Record<string, unknown>,
): Promise<void> {
  await matrix.sendEvent(roomId, BOT_TRIGGER_TYPE, {
    type: kind,
    input: { ...input, sender: userId },
    realm: realm ?? '',
    userId,
  });
}

async function runSyncLoop(
  matrix: MatrixClient,
  roomId: string,
  selfUserId: string,
): Promise<void> {
  let since: string | undefined = undefined;
  // Initial sync — short timeout, skip historical noise.
  try {
    const initial = await matrix.sync(undefined, 0);
    since = initial.next_batch;
  } catch (e) {
    console.error(`${FG_YELLOW}sync seed failed: ${(e as Error).message}${RESET}`);
  }
  // Long-poll.
  while (true) {
    try {
      const result = await matrix.sync(since, 30000);
      since = result.next_batch;
      const events =
        result.rooms?.join?.[roomId]?.timeline?.events ?? [];
      for (const ev of events) {
        renderEvent(ev, selfUserId);
      }
    } catch (e) {
      console.error(`${FG_YELLOW}sync error: ${(e as Error).message}${RESET}`);
      await sleep(2000);
    }
  }
}

function renderEvent(ev: MatrixTimelineEvent, selfUserId: string): void {
  if (ev.type !== BOT_TRIGGER_TYPE) return;
  const content = (ev.content ?? {}) as {
    type?: string;
    input?: { text?: string; sender?: string };
  };
  const kind = content.type ?? '(unknown)';
  const text = content.input?.text ?? '';
  const sender = content.input?.sender ?? ev.sender;
  const isSelf = ev.sender === selfUserId;
  const color = kind.startsWith('card.')
    ? FG_MAGENTA
    : kind.startsWith('cli.')
      ? FG_CLI
      : FG_CYAN;
  const ts = formatTs(ev.origin_server_ts);
  const marker = isSelf ? '→' : '←';
  process.stdout.write(
    `${DIM}${ts}${RESET} ${marker} ${color}${kind.padEnd(14)}${RESET} ${text}  ${DIM}(${sender})${RESET}\n`,
  );
}

function runStdinLoop(
  matrix: MatrixClient,
  roomId: string,
  userId: string,
  realm: string | undefined,
): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    sendBotTrigger(matrix, roomId, userId, realm, 'cli.message', { text }).catch(
      (e: Error) => {
        console.error(`${FG_YELLOW}send error: ${e.message}${RESET}`);
      },
    );
  });
  rl.on('close', () => {
    // stdin closed (EOF) — keep sync loop alive, user may still be watching.
  });
}

function formatTs(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

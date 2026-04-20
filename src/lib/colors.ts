// ANSI color codes
//
// Single source of truth for terminal styling across all commands and libs.
// Ported from the official @cardstack/boxel-cli package; extended with the
// extras the fork uses (FG_WHITE, BG_BLUE) so every inline palette in the
// fork can migrate to these imports.

export const FG_RED = '\x1b[31m';
export const FG_GREEN = '\x1b[32m';
export const FG_YELLOW = '\x1b[33m';
export const FG_MAGENTA = '\x1b[35m';
export const FG_CYAN = '\x1b[36m';
export const FG_WHITE = '\x1b[37m';
export const BG_BLUE = '\x1b[44m';
export const BOLD = '\x1b[1m';
export const DIM = '\x1b[2m';
export const RESET = '\x1b[0m';

import chalk from "chalk";

/** True when stdout is an interactive terminal (so spinners/animation help). */
export const isInteractive =
  process.stdout.isTTY === true && !process.env.CI;

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ESC = String.fromCharCode(27); // ANSI escape
const CLEAR_LINE = `\r${ESC}[2K`;

export interface Spinner {
  start(text: string): void;
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  stop(): void;
}

/**
 * A stderr spinner. stdout is left untouched so `--json` stays pipeable.
 * In a non-interactive context it degrades to plain status lines.
 */
export function createSpinner(): Spinner {
  if (!isInteractive) {
    return {
      start: (t) => console.error(t),
      update: () => {},
      succeed: (t) => t && console.error(t),
      fail: (t) => t && console.error(t),
      stop: () => {},
    };
  }

  let frame = 0;
  let text = "";
  let timer: ReturnType<typeof setInterval> | undefined;

  const paint = (s: string) => process.stderr.write(`${CLEAR_LINE}${s}`);
  const tick = () => {
    frame = (frame + 1) % FRAMES.length;
    paint(`${chalk.cyan(FRAMES[frame])} ${text}`);
  };
  const clear = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    paint("");
  };

  return {
    start(t) {
      text = t;
      timer = setInterval(tick, 80);
      tick();
    },
    update(t) {
      text = t;
    },
    succeed(t) {
      clear();
      if (t) process.stderr.write(`${chalk.green("✓")} ${t}\n`);
    },
    fail(t) {
      clear();
      if (t) process.stderr.write(`${chalk.red("✗")} ${t}\n`);
    },
    stop: clear,
  };
}

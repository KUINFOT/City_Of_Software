/**
 * Minimal structured logger for extraction runs.
 *
 * Deliberately tiny, with one job beyond printing: `collected` accumulates
 * every warning and error, which is exactly what a ScrapeJob's `errors` array
 * needs. Without it the runner would have to keep a second, parallel record of
 * everything it logged, and the two would drift.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /**
   * A logger scoped to one source, with its own independent `collected`.
   *
   * Independent on purpose: a sweep across all sources gives each run its own
   * child, and a warning from DEPA must not end up on MOL's job record. The
   * per-run totals are aggregated through RunResult instead.
   */
  child(scope: string): Logger;
  /** Warnings and errors emitted so far, for the ScrapeJob `errors` array. */
  readonly collected: string[];
}

export function createLogger(scope = 'extraction', minLevel: LogLevel = 'info'): Logger {
  const collected: string[] = [];

  function emit(level: LogLevel, message: string): void {
    const line = `[${scope}] ${message}`;
    if (level === 'warn' || level === 'error') collected.push(line);
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(line);
  }

  return {
    debug: (m) => emit('debug', m),
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m),
    child: (childScope) => createLogger(`${scope}:${childScope}`, minLevel),
    collected,
  };
}

/** Records but never prints — used by tests and by callers that only want `collected`. */
export function createSilentLogger(): Logger {
  return createLogger('silent', 'error');
}

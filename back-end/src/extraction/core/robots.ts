/**
 * robots.txt fetching, parsing and caching.
 *
 * Written by hand rather than pulled from a library for one specific reason,
 * documented in the extraction playbook: Python's `urllib.robotparser`
 * returns `can_fetch() === false` for a robots.txt containing zero
 * `User-agent` groups. That is backwards — a file with no rules restricts
 * nothing. depa.or.th serves exactly that (a newer "content signals" style
 * file with no traditional directives), and the naive answer blocks a site
 * that never asked to be blocked.
 *
 * The rules implemented here:
 *   - No reachable robots.txt at all  -> allowed (nothing said no).
 *   - Reachable but zero groups       -> allowed (the bug above).
 *   - Groups present                  -> longest-matching rule wins;
 *                                        Allow beats Disallow on a tie
 *                                        (per Google's spec).
 *   - A group for our exact UA beats the wildcard `*` group.
 *
 * This is deliberately advisory-only for *technical* access. It says nothing
 * about Terms of Service, which is a separate document that can and does
 * disagree — see `registry.ts` for the ToS gate.
 */

import { URL } from 'node:url';

interface RobotsRule {
  /** Path pattern, supporting the `*` and `$` wildcards. */
  pattern: string;
  allow: boolean;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySec: number | null;
}

export interface RobotsPolicy {
  /** False only when the file was fetched and actually contained groups. */
  readonly permissive: boolean;
  isAllowed(pathname: string): boolean;
  crawlDelayMs(): number | null;
}

/** A policy that permits everything — used when robots.txt says nothing. */
const ALLOW_ALL: RobotsPolicy = {
  permissive: true,
  isAllowed: () => true,
  crawlDelayMs: () => null,
};

function parseRobots(body: string, userAgent: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // Consecutive `User-agent:` lines share one rule block; a directive line
  // ends the header run, so the next User-agent starts a fresh group.
  let inAgentRun = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === 'user-agent') {
      if (!current || !inAgentRun) {
        current = { agents: [], rules: [], crawlDelaySec: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgentRun = true;
      continue;
    }

    if (!current) continue; // Directive before any User-agent — ignore.
    inAgentRun = false;

    if (field === 'disallow') {
      // An empty Disallow means "nothing is disallowed" — skip it rather
      // than record a rule matching every path.
      if (value) current.rules.push({ pattern: value, allow: false });
    } else if (field === 'allow') {
      if (value) current.rules.push({ pattern: value, allow: true });
    } else if (field === 'crawl-delay') {
      const delay = Number(value);
      if (Number.isFinite(delay)) current.crawlDelaySec = delay;
    }
  }

  // The documented failure case: a file that parsed to nothing restricts
  // nothing. Do not fall through to "deny by default".
  if (groups.length === 0) return ALLOW_ALL;

  const ua = userAgent.toLowerCase();
  // An empty `User-agent:` value would make `includes('')` match everything,
  // so it is excluded rather than treated as a specific match for us.
  const exact = groups.find((g) => g.agents.some((a) => a !== '*' && a !== '' && ua.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = exact ?? wildcard;

  if (!group || group.rules.length === 0) {
    return {
      permissive: true,
      isAllowed: () => true,
      crawlDelayMs: () =>
        group?.crawlDelaySec != null ? group.crawlDelaySec * 1000 : null,
    };
  }

  return {
    permissive: false,
    isAllowed(pathname: string): boolean {
      let best: { length: number; allow: boolean } | null = null;
      for (const rule of group.rules) {
        if (!matchesPattern(pathname, rule.pattern)) continue;
        const length = rule.pattern.length;
        // Longest match wins; Allow wins a tie.
        if (!best || length > best.length || (length === best.length && rule.allow)) {
          best = { length, allow: rule.allow };
        }
      }
      return best ? best.allow : true;
    },
    crawlDelayMs: () => (group.crawlDelaySec != null ? group.crawlDelaySec * 1000 : null),
  };
}

/** Path matching with the two wildcards robots.txt actually defines. */
function matchesPattern(pathname: string, pattern: string): boolean {
  const anchoredEnd = pattern.endsWith('$');
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchoredEnd ? '$' : ''}`).test(pathname);
}

interface CacheEntry {
  policy: RobotsPolicy;
  fetchedAt: number;
}

/**
 * Per-origin robots.txt cache. One instance is shared by a whole run so a
 * 50-page crawl fetches robots.txt once, not fifty times.
 */
export class RobotsCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<RobotsPolicy>>();

  constructor(
    private readonly userAgent: string,
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly timeoutMs = 15_000
  ) {}

  async policyFor(url: string): Promise<RobotsPolicy> {
    const origin = new URL(url).origin;
    const cached = this.cache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) return cached.policy;

    const existing = this.inflight.get(origin);
    if (existing) return existing;

    const pending = this.load(origin).finally(() => this.inflight.delete(origin));
    this.inflight.set(origin, pending);
    return pending;
  }

  /** Convenience: is this exact URL fetchable under its origin's robots.txt? */
  async isAllowed(url: string): Promise<boolean> {
    const policy = await this.policyFor(url);
    return policy.isAllowed(new URL(url).pathname);
  }

  private async load(origin: string): Promise<RobotsPolicy> {
    let policy = ALLOW_ALL;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${origin}/robots.txt`, {
          headers: { 'User-Agent': this.userAgent },
          signal: controller.signal,
          redirect: 'follow',
        });
        // 404 / 410 means no robots.txt exists, which means no restrictions.
        // 5xx is ambiguous; treat it as permissive to match the reference
        // implementation rather than stalling a run on a flaky server.
        if (res.ok) policy = parseRobots(await res.text(), this.userAgent);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Unreachable robots.txt — nothing said no.
      policy = ALLOW_ALL;
    }
    this.cache.set(origin, { policy, fetchedAt: Date.now() });
    return policy;
  }
}

/**
 * Command-line entry point for the extraction pipeline.
 *
 *   npm run extract -- --list
 *   npm run extract -- --source dga --year 2569 --pages 2 --dry-run
 *   npm run extract -- --source mol --pre-award-only --attachments
 *   npm run extract -- --all --keyword TOR
 *
 * `--dry-run` parses and reports without opening a database connection or
 * writing anything, which is the right way to check a selector after a site
 * redesign.
 */

import mongoose from 'mongoose';
import { createLogger } from './core/logger';
import { SOURCES, SOURCE_IDS, getSource } from './registry';
import { runSource } from './pipeline/runner';
import { runAllSchedulable } from './index';
import type { RunOptions, RunResult } from './types';

interface Args {
  source?: string;
  all: boolean;
  list: boolean;
  dryRun: boolean;
  attachments: boolean;
  noDetail: boolean;
  preAwardOnly: boolean;
  pages?: number;
  max?: number;
  year?: number;
  delay?: number;
  keywords: string[];
  params: Record<string, string>;
  approvedBy?: string;
  reason?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    all: false,
    list: false,
    dryRun: false,
    attachments: false,
    noDetail: false,
    preAwardOnly: false,
    keywords: [],
    params: {},
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = (): string => argv[++i] ?? '';
    switch (flag) {
      case '--source': args.source = next(); break;
      case '--all': args.all = true; break;
      case '--list': args.list = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--attachments': args.attachments = true; break;
      case '--no-detail': args.noDetail = true; break;
      case '--pre-award-only': args.preAwardOnly = true; break;
      case '--pages': args.pages = Number(next()); break;
      case '--max': args.max = Number(next()); break;
      case '--year': args.year = Number(next()); break;
      case '--delay': args.delay = Number(next()); break;
      case '--keyword': args.keywords.push(next()); break;
      case '--approved-by': args.approvedBy = next(); break;
      case '--reason': args.reason = next(); break;
      case '--param': {
        // --param category=tender
        const [key, ...rest] = next().split('=');
        if (key) args.params[key] = rest.join('=');
        break;
      }
      case '--help':
      case '-h': args.help = true; break;
      default:
        if (flag.startsWith('--')) throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`
Extraction pipeline

  --list                    Show every registered source and its compliance status
  --source <id>             Run one source (${SOURCE_IDS.join(' | ')})
  --all                     Run every source cleared to run unattended
  --dry-run                 Parse and report; write nothing, connect to nothing
  --attachments             Download PDFs and record them as Documents
  --no-detail               Listing pages only — skips one request per row
  --pre-award-only          Keep only rows confirmed not awarded
  --pages <n>               Listing pages to walk
  --max <n>                 Hard cap on records
  --year <BE>               Buddhist Era year (DGA paginates by fiscal year)
  --delay <ms>              Per-host delay between requests (default 1000)
  --keyword <text>          Title filter; repeatable, OR-matched
  --param k=v               Source-specific option (e.g. --param category=tender)
  --approved-by <name>      Required to run a ToS-prohibited source
  --reason <text>           Required to run a ToS-prohibited source
`);
}

function printSources(): void {
  console.log('\nRegistered sources\n');
  for (const id of SOURCE_IDS) {
    const s = SOURCES[id];
    const badge =
      s.compliance.tosStatus === 'prohibited'
        ? 'PROHIBITED BY ToS'
        : s.compliance.tosStatus === 'sanctioned'
          ? 'sanctioned'
          : 'ToS unverified';
    console.log(`  ${id.padEnd(10)} ${s.labelEn}`);
    console.log(`  ${' '.repeat(10)} ${s.homepage}`);
    console.log(
      `  ${' '.repeat(10)} ${badge} · stage signal: ${s.stageSignal} · ` +
        `scheduled: ${s.compliance.allowScheduled ? 'allowed' : 'BLOCKED'}`
    );
    for (const caveat of s.caveats) console.log(`  ${' '.repeat(10)} - ${caveat}`);
    console.log('');
  }
}

function printResult(result: RunResult): void {
  const stages = Object.entries(result.stageCounts)
    .filter(([, count]) => count > 0)
    .map(([stage, count]) => `${stage}=${count}`)
    .join('  ');
  console.log(
    `\n${result.sourceId}: ${result.status} — found ${result.found}, new ${result.created}, ` +
      `updated ${result.updated}, unchanged ${result.unchanged}`
  );
  if (stages) console.log(`  stages: ${stages}`);
  console.log(`  pre-award (a vendor can still act): ${result.preAwardCount}`);
  console.log(
    `  newest announcement: ${
      result.newestAnnouncedAt ? result.newestAnnouncedAt.toISOString().slice(0, 10) : 'unknown'
    }`
  );
  if (result.errors.length > 0) {
    console.log(`  ${result.errors.length} warning(s)/error(s) — see the ScrapeJob record`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) return printHelp();
  if (args.list) return printSources();
  if (!args.source && !args.all) {
    printHelp();
    throw new Error('Nothing to do: pass --source <id>, --all, or --list.');
  }

  const options: RunOptions = {
    trigger: 'manual',
    dryRun: args.dryRun,
    withAttachments: args.attachments,
    withDetail: !args.noDetail,
    preAwardOnly: args.preAwardOnly,
    keywords: args.keywords,
    maxPages: args.pages,
    maxRecords: args.max,
    budgetYearBe: args.year,
    delayMs: args.delay,
    params: args.params,
  };

  if (args.approvedBy && args.reason) {
    options.overrideTosBlock = { approvedBy: args.approvedBy, reason: args.reason };
  } else if (args.source) {
    // Fail before crawling, not after, when the override is half-supplied.
    const source = getSource(args.source);
    if (source.compliance.tosStatus === 'prohibited' && (args.approvedBy || args.reason)) {
      throw new Error('Both --approved-by and --reason are required to override a ToS block.');
    }
  }

  const logger = createLogger('extract');

  // A dry run touches no database. `config/db` pulls in `config/env`, which
  // throws when MONGODB_URI is unset — so it is imported only when needed,
  // keeping dry runs usable with no environment configured at all.
  if (!args.dryRun) {
    // The `.js` extension is required here and only here: under
    // `moduleResolution: nodenext`, dynamic imports are resolved as ESM (which
    // needs the emitted filename) while the static imports above are not.
    const { connectDB } = await import('../config/db.js');
    await connectDB();
  }

  try {
    const results = args.all
      ? await runAllSchedulable(options, { logger })
      : [await runSource(args.source!, options, { logger })];
    results.forEach(printResult);

    if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
  } finally {
    if (!args.dryRun) await mongoose.disconnect();
  }
}

main().catch((err: Error) => {
  console.error(`\n${err.message}\n`);
  process.exitCode = 1;
});

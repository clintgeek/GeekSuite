#!/usr/bin/env node
// tools/kill-orphans.mjs
//
// Lists (default / --dry-run) or kills (--kill) dev-tooling processes left behind by a stopped
// agent on this box: vite (dev + preview), vitest workers, `serve` instances, playwright/chromium
// headless shells, and jest workers. A process only qualifies if it is owned by the current user,
// matches one of those tool signatures, and is either orphaned (parent is dead: PPID 1, or the
// parent PID no longer exists) or older than --older-than minutes (default 30).
//
// Reads /proc/*/cmdline and /proc/*/stat directly — no `pgrep -f` / `pkill -f`. Kills by PID with
// process.kill(), never by pattern. See DOCS/RUNBOOK.md for when to reach for this.
//
// Usage:
//   node tools/kill-orphans.mjs                  # list mode (default)
//   node tools/kill-orphans.mjs --dry-run         # same as above, explicit
//   node tools/kill-orphans.mjs --kill            # actually terminate matches
//   node tools/kill-orphans.mjs --older-than 15   # age threshold in minutes (default 30)

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const NEVER_KILL_SUBSTRINGS = ['claude', 'node_modules/.bin/claude', 'docker', 'watchtower'];

export const CATEGORIES = [
  {
    label: 'vite-preview',
    test: (cmd) => /(^|\/)vite(\.js)?\b/.test(cmd) && /\bpreview\b/.test(cmd),
  },
  {
    label: 'vite-dev',
    test: (cmd) => /(^|\/)vite(\.js)?\b/.test(cmd),
  },
  {
    label: 'vitest',
    test: (cmd) => /(^|\/)vitest(\/|\.m?js|\b)/.test(cmd),
  },
  {
    label: 'jest-worker',
    test: (cmd) => /jest-worker/.test(cmd) || /(^|\/)jest(\/bin\/jest\.js|\b)/.test(cmd),
  },
  {
    label: 'playwright/chromium',
    test: (cmd) =>
      /ms-playwright/.test(cmd) ||
      /playwright[\\/]/.test(cmd) ||
      /chrome-linux[\\/]chrome/.test(cmd) ||
      /headless_shell/.test(cmd) ||
      (/chromium/.test(cmd) && /--headless/.test(cmd)),
  },
  {
    label: 'serve',
    test: (cmd, argv) => {
      const exe = argv[0] || '';
      const exeBase = exe.split('/').pop();
      return (
        exeBase === 'serve' ||
        /node_modules[\\/]serve[\\/]build[\\/]main\.js/.test(cmd) ||
        /node_modules[\\/]\.bin[\\/]serve\b/.test(cmd)
      );
    },
  },
];

export function classify(cmd, argv) {
  const category = CATEGORIES.find((c) => c.test(cmd, argv));
  return category ? category.label : null;
}

export function isNeverKill(cmd) {
  return NEVER_KILL_SUBSTRINGS.some((s) => cmd.includes(s));
}

function readPageSize() {
  try {
    return parseInt(execSync('getconf PAGESIZE', { encoding: 'utf8' }).trim(), 10) || 4096;
  } catch {
    return 4096;
  }
}

function readClkTck() {
  try {
    return parseInt(execSync('getconf CLK_TCK', { encoding: 'utf8' }).trim(), 10) || 100;
  } catch {
    return 100;
  }
}

function readBootTime() {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8');
    const m = stat.match(/^btime (\d+)/m);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function readCmdline(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`);
    if (raw.length === 0) return null; // kernel thread or already gone
    const parts = raw
      .toString('utf8')
      .split('\0')
      .filter((s) => s.length > 0);
    return parts;
  } catch {
    return null; // permission denied or process gone
  }
}

function readStat(pid) {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // "pid (comm) state ppid ..." — comm can contain spaces/parens, so split on the LAST ')'.
    const closeParen = raw.lastIndexOf(')');
    if (closeParen === -1) return null;
    const rest = raw.slice(closeParen + 2).trim().split(/\s+/);
    // rest[0]=state(3) [1]=ppid(4) ... [19]=starttime(22) [21]=rss(24)
    return {
      ppid: parseInt(rest[1], 10),
      starttime: parseInt(rest[19], 10),
      rssPages: parseInt(rest[21], 10),
    };
  } catch {
    return null;
  }
}

function readUid(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = status.match(/^Uid:\s+(\d+)/m);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function pidExists(pid) {
  return fs.existsSync(`/proc/${pid}`);
}

function listPids() {
  return fs
    .readdirSync('/proc')
    .filter((name) => /^\d+$/.test(name))
    .map((name) => parseInt(name, 10));
}

function ancestorsOf(pid) {
  const seen = new Set([pid]);
  let cur = pid;
  for (let i = 0; i < 200; i++) {
    const st = readStat(cur);
    if (!st || !st.ppid || st.ppid === cur) break;
    seen.add(st.ppid);
    if (st.ppid === 1) break;
    cur = st.ppid;
  }
  return seen;
}

export function fmtAge(seconds) {
  if (seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

export function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

export function parseArgs(argv) {
  const opts = { kill: false, olderThanMin: 30 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kill') opts.kill = true;
    else if (a === '--dry-run') opts.kill = false;
    else if (a === '--older-than') {
      const v = parseFloat(argv[++i]);
      if (!Number.isNaN(v)) opts.olderThanMin = v;
    } else if (a.startsWith('--older-than=')) {
      const v = parseFloat(a.split('=')[1]);
      if (!Number.isNaN(v)) opts.olderThanMin = v;
    }
  }
  return opts;
}

export function findCandidates({ olderThanMin }) {
  const pageSize = readPageSize();
  const clkTck = readClkTck();
  const btime = readBootTime();
  const myUid = process.getuid ? process.getuid() : null;
  const myAncestors = ancestorsOf(process.pid);
  const nowSec = Date.now() / 1000;

  const candidates = [];

  for (const pid of listPids()) {
    if (myAncestors.has(pid)) continue; // never touch our own ancestor chain (or ourselves)

    const argv = readCmdline(pid);
    if (!argv || argv.length === 0) continue;
    const cmd = argv.join(' ');

    if (NEVER_KILL_SUBSTRINGS.some((s) => cmd.includes(s))) continue;

    const category = CATEGORIES.find((c) => c.test(cmd, argv));
    if (!category) continue;

    if (myUid !== null) {
      const uid = readUid(pid);
      if (uid === null || uid !== myUid) continue;
    }

    const stat = readStat(pid);
    if (!stat) continue;

    const parentDead = stat.ppid === 1 || !pidExists(stat.ppid);

    let ageSec = null;
    if (btime !== null && !Number.isNaN(stat.starttime)) {
      const startUnix = btime + stat.starttime / clkTck;
      ageSec = nowSec - startUnix;
    }
    const ageMin = ageSec !== null ? ageSec / 60 : null;
    const isOld = ageMin !== null && ageMin > olderThanMin;

    if (!parentDead && !isOld) continue; // neither orphaned nor old enough

    const rssMb = Number.isNaN(stat.rssPages) ? null : (stat.rssPages * pageSize) / (1024 * 1024);

    candidates.push({
      pid,
      ppid: stat.ppid,
      parentDead,
      ageSec,
      rssMb,
      category: category.label,
      cmd,
    });
  }

  return candidates;
}

function printTable(candidates, title) {
  console.log(`\n${title} (${candidates.length}):`);
  if (candidates.length === 0) {
    console.log('  (none)');
    return;
  }
  const header = ['PID', 'AGE', 'RSS(MB)', 'REASON', 'CATEGORY', 'CMD'];
  const rows = candidates.map((c) => [
    String(c.pid),
    c.ageSec !== null ? fmtAge(c.ageSec) : '?',
    c.rssMb !== null ? c.rssMb.toFixed(1) : '?',
    c.parentDead ? 'dead-parent' : 'age',
    c.category,
    truncate(c.cmd, 80),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmtRow = (r) => r.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  console.log('  ' + fmtRow(header));
  for (const r of rows) console.log('  ' + fmtRow(r));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const before = findCandidates(opts);

  printTable(before, opts.kill ? 'Killing' : 'Found (dry-run — pass --kill to terminate)');
  console.log(`\nTotal candidates before: ${before.length}`);

  if (!opts.kill) {
    console.log('\nDry-run only — no processes were touched. Pass --kill to terminate these.');
    return;
  }

  for (const c of before) {
    try {
      process.kill(c.pid, 'SIGTERM');
    } catch (err) {
      console.log(`  failed to signal pid ${c.pid}: ${err.message}`);
    }
  }

  // Give SIGTERM a moment, then check for stragglers and escalate.
  try {
    execSync('sleep 2');
  } catch {
    // ignore — worst case we escalate a hair early
  }

  const stragglers = before.filter((c) => pidExists(c.pid));
  for (const c of stragglers) {
    try {
      process.kill(c.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }

  const after = findCandidates(opts);
  console.log(`\nTotal candidates after: ${after.length}`);
  if (after.length > 0) {
    printTable(after, 'Still present');
  }
}

// Only run when invoked directly (`node tools/kill-orphans.mjs`), not when imported by the
// selftest (`tools/kill-orphans.selftest.mjs`) for unit coverage of the pure logic above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

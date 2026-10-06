/**
 * installShutdownHooks, for real: a child process with a real http.Server
 * receives a real SIGTERM. Nine backends depend on this (2026-10-06); the
 * per-app tests only check the wiring, so this is where the behaviour is pinned.
 */
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOGGER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');

function run({ listen }) {
  const script = `
    const http = require('http');
    const { installShutdownHooks } = require(${JSON.stringify(LOGGER)});
    const logger = { info() {}, error() {} };
    const server = http.createServer((req, res) => res.end('ok'));
    installShutdownHooks(logger, server, {
      timeoutMs: 5000,
      onClose: async () => {
        await new Promise((r) => setTimeout(r, 50));
        process.stdout.write('CLEANED\\n');
      },
    });
    ${listen ? "server.listen(0, '127.0.0.1', () => process.stdout.write('READY\\n'));" : "process.stdout.write('READY\\n'); setInterval(() => {}, 1000);"}
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      if (out.includes('READY') && !child.signalled) {
        child.signalled = true;
        child.kill('SIGTERM');
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, out }));
  });
}

describe('installShutdownHooks', () => {
  it('on SIGTERM: closes the listening server, awaits onClose, exits 0', async () => {
    const { code, out } = await run({ listen: true });
    expect(out).toContain('CLEANED');
    expect(code).toBe(0);
  });

  it('a signal before listen() still runs onClose and exits 0', async () => {
    const { code, out } = await run({ listen: false });
    expect(out).toContain('CLEANED');
    expect(code).toBe(0);
  });
});

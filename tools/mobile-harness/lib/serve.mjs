// Build an app and serve its dist with `vite preview`.
//
// Why preview and not the dev server: bookgeek's dev config hardcodes an
// absolute basegeek API host, and the dev servers of several apps proxy to
// backends that do not exist in CI. `vite preview` serves the built bundle
// with an SPA fallback and talks to nothing, so the route fixtures are the
// only source of data.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSpec } from './registry.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: REPO_ROOT, ...opts });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });

export async function buildApp(name) {
  const app = appSpec(name);
  if (app.pm === 'npm') {
    await run('npm', ['run', 'build'], { cwd: path.join(REPO_ROOT, app.dir) });
  } else {
    await run('pnpm', ['--filter', app.pkg, 'build']);
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

export async function startPreview(name, { timeoutMs = 60000 } = {}) {
  const app = appSpec(name);
  const port = await freePort();
  const cwd = path.join(REPO_ROOT, app.dir);
  // Run the app's own vite binary rather than `npx vite`: npx adds a process
  // layer that survives SIGTERM, and its open pipes keep node alive forever
  // after the run finishes.
  const local = path.join(cwd, 'node_modules', '.bin', 'vite');
  const bin = fs.existsSync(local) ? local : 'npx';
  const args = bin === 'npx'
    ? ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1']
    : ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
  const child = spawn(bin, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    detached: true, // own process group, so stop() can take the whole tree down
  });
  let log = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`vite preview for ${name} did not start in ${timeoutMs}ms:\n${log}`)), timeoutMs);
    const onData = (buf) => {
      log += buf.toString();
      // Vite bolds the port in colour mode (`http://127.0.0.1:` + ESC[1m41711ESC[22m/), which
      // broke `:\d+` on GitHub Actions — strip ANSI before matching. NO_COLOR is also set on
      // the child below; the strip stays as belt and braces.
      const plain = log.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
      const m = /(https?:\/\/(?:localhost|127\.0\.0\.1):\d+\/?[^\s]*)/.exec(plain);
      if (m) {
        clearTimeout(timer);
        resolve(m[1].replace(/\/$/, ''));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`vite preview for ${name} exited ${code}:\n${log}`));
    });
  });
  let died = null;
  let stopping = false;
  child.on('exit', (code, signal) => {
    if (stopping) return; // our own SIGTERM at the end of the run
    died = `vite preview for ${name} exited (code ${code}, signal ${signal}) mid-run:\n${log.slice(-2000)}`;
    console.error(`  ${died}`);
  });

  return {
    url,
    get died() {
      return died;
    },
    async stop() {
      stopping = true;
      const signal = (sig) => {
        try {
          process.kill(-child.pid, sig); // the group, not just the leader
        } catch {
          try { child.kill(sig); } catch { /* already gone */ }
        }
      };
      child.stdout?.destroy();
      child.stderr?.destroy();
      signal('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      signal('SIGKILL');
    },
  };
}

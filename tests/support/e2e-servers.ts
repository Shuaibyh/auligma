import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';

type ServerMode = 'demo' | 'real' | 'local-ai';
type ManagedServer = { name: string; process: ChildProcess };

const root = resolve(import.meta.dirname, '..', '..');
const wait = (milliseconds: number) => new Promise(resolveWait => setTimeout(resolveWait, milliseconds));

function start(name: string, args: string[], environment: NodeJS.ProcessEnv): ManagedServer {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.on('data', chunk => process.stdout.write(`[e2e:${name}] ${chunk}`));
  child.stderr?.on('data', chunk => process.stderr.write(`[e2e:${name}] ${chunk}`));
  return { name, process: child };
}
async function waitUntilReady(server: ManagedServer, url: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.process.exitCode !== null) throw new Error(`${server.name} terminó antes de responder en ${url} (código ${server.process.exitCode}).`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* El servidor todavía está iniciando. */ }
    await wait(200);
  }
  throw new Error(`${server.name} no respondió en ${url} dentro de 20 segundos.`);
}

async function stop(server: ManagedServer) {
  const child = server.process;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  const result = await Promise.race([exited.then(() => true), wait(5000).then(() => false)]);
  if (!result && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const forced = await Promise.race([once(child, 'exit').then(() => true), wait(3000).then(() => false)]);
    if (!forced) throw new Error(`No se pudo cerrar el proceso auxiliar ${server.name} (PID ${child.pid}).`);
  }
}

export default async function setup(config: FullConfig) {
  const mode = config.metadata.auligmaServerMode as ServerMode | undefined;
  if (!mode) throw new Error('Falta metadata.auligmaServerMode en la configuración de Playwright.');
  const servers: ManagedServer[] = [];
  const vitePort = mode === 'demo' ? 5173 : mode === 'real' ? 5174 : 5180;
  try {
    const vite = start('vite', ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { VITE_DEMO_MODE: mode === 'demo' ? 'true' : 'false' });
    servers.push(vite);
    await waitUntilReady(vite, `http://127.0.0.1:${vitePort}`);
    if (mode === 'real') {
      const api = start('fastify', ['--env-file-if-exists=.env', '--import', 'tsx', 'server/index.ts'], {
        FRONTEND_URL: 'http://127.0.0.1:5174', BACKEND_URL: 'http://127.0.0.1:3001', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
      });
      servers.push(api);
      await waitUntilReady(api, 'http://127.0.0.1:3001/api/v1/health');
    }
  } catch (error) {
    await Promise.allSettled([...servers].reverse().map(stop));
    throw error;
  }
  return async () => {
    const results = await Promise.allSettled([...servers].reverse().map(stop));
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  };
}

// Starts the FastAPI backend for E2E tests on a brand-new, seeded SQLite database.
// Uses `uv` when available, otherwise the active Python environment.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend');
const dbPath = join(backendDir, 'e2e.db');
for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });

const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${dbPath}`,
  SEED_DEMO_DATA: 'true',
  CORS_ORIGINS: 'http://localhost:3000',
};
const hasUv = spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0;
const run = (args) => (hasUv ? ['uv', ['run', ...args]] : [args[0], args.slice(1)]);

for (const args of [
  ['alembic', 'upgrade', 'head'],
  ['python', '-m', 'app.seed'],
]) {
  const [cmd, cmdArgs] = run(args);
  const result = spawnSync(cmd, cmdArgs, { cwd: backendDir, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const [cmd, cmdArgs] = run(['uvicorn', 'app.main:app', '--port', '8000']);
const server = spawn(cmd, cmdArgs, { cwd: backendDir, env, stdio: 'inherit' });
const stop = () => server.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));

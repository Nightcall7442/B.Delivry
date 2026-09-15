/**
 * Local Postgres without Docker: real server binaries (the platform package
 * behind `embedded-postgres`), data in apps/api/.local/pg, credentials from .env
 * so one DATABASE_URL serves `prisma migrate`, the seed and the API.
 *
 *   pnpm --filter @bazar/api db:local      # keeps running; Ctrl+C stops it
 *
 * Driven through initdb/pg_ctl rather than the library's own start(): on
 * Windows only pg_ctl knows how to drop administrator rights, and postgres.exe
 * refuses to run with them. Port 5433 by default — 5432 is usually taken by a
 * system-wide install.
 *
 * ponytail: one cluster, one superuser, no tuning. Docker compose remains the
 * path for anyone who has Docker.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const user = process.env['POSTGRES_USER'] ?? 'bazar';
const password = process.env['POSTGRES_PASSWORD'] ?? 'change_me';
const port = process.env['POSTGRES_PORT'] ?? '5433';
const local = join(process.cwd(), '.local');
const dataDir = join(local, 'pg');
const logFile = join(local, 'pg.log');

const require = createRequire(import.meta.url);
const pkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
const bin = join(dirname(require.resolve(`${pkg}/package.json`)), 'native', 'bin');
const exe = (name: string) => join(bin, process.platform === 'win32' ? `${name}.exe` : name);

function run(name: string, args: string[]): void {
  const result = spawnSync(exe(name), args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${name} exited with ${result.status ?? result.signal}`);
    process.exit(1);
  }
}

mkdirSync(local, { recursive: true });

if (!existsSync(join(dataDir, 'PG_VERSION'))) {
  console.log(`initialising cluster in ${dataDir}`);
  const pwfile = join(local, 'pwfile');
  writeFileSync(pwfile, `${password}\n`);
  run('initdb', [
    '-D',
    dataDir,
    '-U',
    user,
    `--pwfile=${pwfile}`,
    '-A',
    'scram-sha-256',
    '-E',
    'UTF8',
    '--locale=C',
  ]);
}

run('pg_ctl', ['-D', dataDir, '-o', `-p ${port}`, '-l', logFile, '-w', 'start']);
console.log(`postgres ready: postgresql://${user}:***@localhost:${port} (log: ${logFile})`);
console.log('Ctrl+C to stop');

const stop = () => {
  spawn(exe('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], { stdio: 'inherit' }).on('exit', () =>
    process.exit(0),
  );
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// pg_ctl detaches the server; keep this process around as the thing to Ctrl+C.
setInterval(() => {}, 1 << 30);

#!/usr/bin/env node
/**
 * Automatiza add + commit + push para o GitHub.
 * Uso: npm run push
 *      npm run push -- "minha mensagem de commit"
 */

import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const msg = process.argv.slice(2).join(' ').trim()
  || 'chore: atualizações traccar-web';

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: root, stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

try {
  run('git add -A');
  const status = execSync('git status --short', { cwd: root, encoding: 'utf-8' });
  if (!status.trim()) {
    console.log('Nada para commitar. Working tree limpo.');
    process.exit(0);
  }
  git(['commit', '-m', msg]);
  git(['push']);
  console.log('Push concluído.');
} catch (e) {
  if (e.status != null) process.exit(e.status);
  throw e;
}

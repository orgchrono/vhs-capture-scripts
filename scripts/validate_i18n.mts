/**
 * i18n parity validator calling native Rust engine CLI.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT: string = path.resolve(__dirname, '..');
const LOCALES_PATH: string = path.join(PROJECT_ROOT, 'ui', 'src', 'locales');

const res: SpawnSyncReturns<Buffer> = spawnSync(
  'cargo',
  ['run', '--', 'validate-i18n', LOCALES_PATH],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: PROJECT_ROOT,
  }
);

process.exit(res.status ?? 1);

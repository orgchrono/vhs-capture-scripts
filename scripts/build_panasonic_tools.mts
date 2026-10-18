/**
 * Build and fixity verification script for Panasonic DVR recovery toolchain.
 * Written in strict TypeScript (.mts). Supports GCC and Clang across Windows, Linux, and macOS.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { logger } from './logger.mts';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT: string = path.resolve(__dirname, '..');
const TOOLS_DIR: string = path.join(PROJECT_ROOT, 'tools', 'panasonic_rec');
const SRC_DIR: string = path.join(TOOLS_DIR, 'src');
const MANIFEST_PATH: string = path.join(TOOLS_DIR, 'checksums.json');

interface BinaryEntry {
  sha256: string;
  size_bytes: number;
}

interface FixityManifest {
  version: string;
  description: string;
  binaries: Record<string, Record<string, BinaryEntry>>;
}

function computeSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data: Buffer = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function getPlatformKey(): string {
  if (process.platform === 'win32') {
    return 'windows-x64';
  }
  return `${process.platform}-${process.arch}`;
}

function verifyPrecompiledBinaries(): boolean {
  if (!fs.existsSync(MANIFEST_PATH)) {
    logger.warn(`No fixity manifest found at ${MANIFEST_PATH}`);
    return true;
  }

  let manifest: FixityManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as FixityManifest;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Failed loading checksums.json: ${message}`);
    return false;
  }

  const platformKey: string = getPlatformKey();
  const knownBins: Record<string, BinaryEntry> | undefined = manifest.binaries?.[platformKey];

  if (!knownBins) {
    logger.info(`No precompiled manifest entry for ${platformKey}`);
    return true;
  }

  logger.info(`Verifying cryptographic SHA-256 fixity (${platformKey})...`);
  let allOk: boolean = true;

  for (const [binName, info] of Object.entries(knownBins)) {
    const binPath: string = path.join(TOOLS_DIR, binName);
    if (!fs.existsSync(binPath)) {
      logger.warn(`Missing pre-compiled binary: ${binName}`);
      allOk = false;
      continue;
    }

    const actualSha: string = computeSha256(binPath);
    const expectedSha: string = info.sha256 || '';

    if (actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
      logger.error(
        `Cryptographic hash mismatch for ${binName}! Expected: ${expectedSha}, Actual: ${actualSha}`
      );
      allOk = false;
    } else {
      logger.success(
        `Verified fixity: ${binName} (SHA-256: ${actualSha.substring(0, 16)}...)`
      );
    }
  }

  return allOk;
}

function findCompiler(): string | null {
  for (const compiler of ['gcc', 'clang']) {
    const checkCmd: string = process.platform === 'win32' ? 'where.exe' : 'which';
    const res: SpawnSyncReturns<Buffer> = spawnSync(checkCmd, [compiler], { stdio: 'pipe' });
    if (res.status === 0) {
      return compiler;
    }
  }
  return null;
}

function buildTools(forceRecompile: boolean = false): boolean {
  const isWindows: boolean = process.platform === 'win32';
  const isMac: boolean = process.platform === 'darwin';
  const exeSuffix: string = isWindows ? '.exe' : '';

  const targetTools: string[] = [
    `extract_meihdfs${exeSuffix}`,
    `dvd-vr${exeSuffix}`,
    `udf_dump${exeSuffix}`,
  ];

  const allExist: boolean = targetTools.every((t) => fs.existsSync(path.join(TOOLS_DIR, t)));

  if (isWindows && allExist && !forceRecompile) {
    logger.info('Validating cryptographic fixity of pre-compiled binaries...');
    if (verifyPrecompiledBinaries()) {
      logger.success('Pre-compiled Windows binaries verified against checksums.json.');
      return true;
    }
    logger.warn('Pre-compiled binary verification failed, attempting recompile from source...');
  }

  const compiler: string | null = findCompiler();
  if (!compiler) {
    if (isWindows && allExist) {
      logger.info('Validating cryptographic fixity of pre-compiled binaries...');
      if (verifyPrecompiledBinaries()) {
        logger.success('Pre-compiled Windows binaries verified against checksums.json.');
        return true;
      }
      logger.error('Pre-compiled binaries failed SHA-256 verification and no compiler found!');
      return false;
    }
    logger.error('No suitable C compiler (gcc, clang) found in PATH.');
    return false;
  }

  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  let success: boolean = true;

  // 1. extract_meihdfs
  const meihdfsSrc: string = path.join(SRC_DIR, 'meihdfs', 'extract', 'extract_meihdfs.c');
  const meihdfsDir: string = path.dirname(meihdfsSrc);
  const meihdfsOut: string = path.join(TOOLS_DIR, `extract_meihdfs${exeSuffix}`);

  if (fs.existsSync(meihdfsSrc)) {
    const args: string[] = ['-O2', `-I${meihdfsDir}`];
    if (!isMac) args.push('-s');
    args.push('-o', meihdfsOut, meihdfsSrc);

    logger.info(`Compiling extract_meihdfs -> ${meihdfsOut}...`);
    const res: SpawnSyncReturns<Buffer> = spawnSync(compiler, args, { stdio: 'pipe' });
    if (res.status !== 0) {
      logger.error(`Failed compiling extract_meihdfs:\n${res.stderr?.toString()}`);
      success = false;
    } else {
      if (!isWindows) fs.chmodSync(meihdfsOut, 0o755);
      const sha: string = computeSha256(meihdfsOut);
      const size: number = fs.statSync(meihdfsOut).size;
      logger.success(`Successfully compiled extract_meihdfs (${size} bytes, SHA-256: ${sha.substring(0, 16)}...)`);
    }
  } else {
    logger.error(`Source not found: ${meihdfsSrc}`);
    success = false;
  }

  // 2. dvd-vr
  const dvdVrDir: string = path.join(SRC_DIR, 'meihdfs', 'dvd-vr-meihdfs');
  const dvdVrSrc: string = path.join(dvdVrDir, 'dvd-vr.c');
  const dvdVrOut: string = path.join(TOOLS_DIR, `dvd-vr${exeSuffix}`);

  if (fs.existsSync(dvdVrSrc)) {
    const args: string[] = ['-std=gnu99', '-DVERSION="0.9.8b"', '-O3', '-DNDEBUG', `-I${dvdVrDir}`];
    if (isWindows) {
      args.push(
        '-DMINGW',
        `-I${path.join(dvdVrDir, 'mingw')}`,
        path.join(dvdVrDir, 'mingw', 'sys', 'mman.c')
      );
    }
    args.push('-o', dvdVrOut, dvdVrSrc);

    logger.info(`Compiling dvd-vr -> ${dvdVrOut}...`);
    const res: SpawnSyncReturns<Buffer> = spawnSync(compiler, args, { stdio: 'pipe' });
    if (res.status !== 0) {
      logger.error(`Failed compiling dvd-vr:\n${res.stderr?.toString()}`);
      success = false;
    } else {
      if (!isWindows) fs.chmodSync(dvdVrOut, 0o755);
      const sha: string = computeSha256(dvdVrOut);
      const size: number = fs.statSync(dvdVrOut).size;
      logger.success(`Successfully compiled dvd-vr (${size} bytes, SHA-256: ${sha.substring(0, 16)}...)`);
    }
  } else {
    logger.error(`Source not found: ${dvdVrSrc}`);
    success = false;
  }

  // 3. udf_dump
  const udfDir: string = path.join(SRC_DIR, 'udf', 'pana-udf');
  const cdioDir: string = path.join(udfDir, 'cdio');
  const udfDumpSrc: string = path.join(udfDir, 'udf_dump.c');
  const udfOut: string = path.join(TOOLS_DIR, `udf_dump${exeSuffix}`);

  if (fs.existsSync(udfDumpSrc)) {
    const args: string[] = [
      '-Wno-error=implicit-function-declaration',
      '-O2',
      '-DDISABLE_ASM_OPTIMIZE',
      `-I${udfDir}`,
      `-I${cdioDir}`,
    ];
    if (isMac) {
      args.push('-Doff64_t=off_t', '-Dlseek64=lseek');
    }
    args.push(
      '-o',
      udfOut,
      path.join(udfDir, 'udf_file.c'),
      path.join(udfDir, 'udf_fs.c'),
      path.join(udfDir, 'udf_time.c'),
      udfDumpSrc
    );

    logger.info(`Compiling udf_dump -> ${udfOut}...`);
    const res: SpawnSyncReturns<Buffer> = spawnSync(compiler, args, { stdio: 'pipe' });
    if (res.status !== 0) {
      logger.error(`Failed compiling udf_dump:\n${res.stderr?.toString()}`);
      success = false;
    } else {
      if (!isWindows) fs.chmodSync(udfOut, 0o755);
      const sha: string = computeSha256(udfOut);
      const size: number = fs.statSync(udfOut).size;
      logger.success(`Successfully compiled udf_dump (${size} bytes, SHA-256: ${sha.substring(0, 16)}...)`);
    }
  } else {
    logger.error(`Source not found: ${udfDumpSrc}`);
    success = false;
  }

  return success;
}

function updateManifest(): boolean {
  const isWindows: boolean = process.platform === 'win32';
  const platformKey: string = getPlatformKey();
  const exeSuffix: string = isWindows ? '.exe' : '';

  let manifest: FixityManifest = {
    version: '1.0',
    description: 'Cryptographic fixity manifest for pre-compiled Panasonic DVR recovery binaries',
    binaries: {},
  };

  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as FixityManifest;
    } catch {
      // Fallback to fresh manifest
    }
  }

  if (!manifest.binaries) manifest.binaries = {};
  if (!manifest.binaries[platformKey]) manifest.binaries[platformKey] = {};

  const targetTools: string[] = [
    `extract_meihdfs${exeSuffix}`,
    `dvd-vr${exeSuffix}`,
    `udf_dump${exeSuffix}`,
  ];

  let updatedCount: number = 0;
  for (const toolName of targetTools) {
    const toolPath: string = path.join(TOOLS_DIR, toolName);
    if (fs.existsSync(toolPath)) {
      const sha: string = computeSha256(toolPath);
      const size: number = fs.statSync(toolPath).size;
      manifest.binaries[platformKey][toolName] = {
        sha256: sha,
        size_bytes: size,
      };
      logger.info(`Updated manifest entry for ${toolName}: ${sha.substring(0, 16)}... (${size} bytes)`);
      updatedCount += 1;
    } else {
      logger.warn(`Binary not found to hash: ${toolName}`);
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    logger.success(`Manifest successfully updated at ${MANIFEST_PATH}`);
    return true;
  }

  return false;
}

const args: string[] = process.argv.slice(2);
if (args.includes('--verify')) {
  const ok: boolean = verifyPrecompiledBinaries();
  process.exit(ok ? 0 : 1);
}

if (args.includes('--update-manifest')) {
  const ok: boolean = updateManifest();
  process.exit(ok ? 0 : 1);
}

const force: boolean = args.includes('--rebuild') || args.includes('--force');
const ok: boolean = buildTools(force);
process.exit(ok ? 0 : 1);

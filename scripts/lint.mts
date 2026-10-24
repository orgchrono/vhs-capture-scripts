/**
 * VHS Studio Pro - Automated Quality Gates Runner (TypeScript .mts)
 * Runs all 9 quality checks and generates logs/build_report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { logger } from './logger.mts';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT: string = path.resolve(__dirname, '..');

interface LintStep {
  name: string;
  command: string;
  args: string[];
  cwd: string;
}

interface StepResult {
  step: LintStep;
  passed: boolean;
  output: string;
}

const steps: LintStep[] = [
  {
    name: 'Anti-Duplication (JSCPD)',
    command: 'npx',
    args: ['jscpd', 'ui/src', '--threshold', '0'],
    cwd: PROJECT_ROOT,
  },
  {
    name: 'UI Linter (Oxlint / ESLint)',
    command: 'npm',
    args: ['run', 'lint'],
    cwd: path.join(PROJECT_ROOT, 'ui'),
  },
  {
    name: 'TSC (TypeScript Strict Types)',
    command: 'npm',
    args: ['run', 'build'],
    cwd: path.join(PROJECT_ROOT, 'ui'),
  },
  {
    name: 'Vitest (React Unit Tests)',
    command: 'npm',
    args: ['run', 'test:unit'],
    cwd: path.join(PROJECT_ROOT, 'ui'),
  },
  {
    name: 'Playwright (E2E React)',
    command: 'npx',
    args: ['playwright', 'test', '--project=chromium', '--reporter=list'],
    cwd: path.join(PROJECT_ROOT, 'ui'),
  },
  {
    name: 'Cargo Check (Rust Compilation)',
    command: 'cargo',
    args: ['check'],
    cwd: PROJECT_ROOT,
  },
  {
    name: 'Cargo Clippy (Rust Quality)',
    command: 'cargo',
    args: ['clippy', '--', '-D', 'warnings'],
    cwd: PROJECT_ROOT,
  },
  {
    name: 'Cargo Test (Rust Unit Tests)',
    command: 'cargo',
    args: ['test'],
    cwd: PROJECT_ROOT,
  },
  {
    name: 'i18n Parity (10 Locales)',
    command: 'node',
    args: ['scripts/validate_i18n.mts'],
    cwd: PROJECT_ROOT,
  },
];

function runStep(step: LintStep): Promise<StepResult> {
  return new Promise((resolve) => {
    const isWindows: boolean = process.platform === 'win32';
    let child: ChildProcess;

    if (isWindows) {
      const fullCommand = [step.command, ...step.args].join(' ');
      child = spawn(fullCommand, {
        cwd: step.cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
    } else {
      child = spawn(step.command, step.args, {
        cwd: step.cwd,
        shell: false,
        env: { ...process.env, FORCE_COLOR: '0' },
      });
    }

    let output: string = '';
    child.stdout?.on('data', (d: Buffer) => {
      output += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      output += d.toString();
    });

    child.on('close', (code: number | null) => {
      resolve({
        step,
        passed: code === 0,
        output,
      });
    });

    child.on('error', (err: Error) => {
      resolve({
        step,
        passed: false,
        output: err.message,
      });
    });
  });
}

async function main(): Promise<void> {
  logger.info('[Git Hook] Starting automated code validation (Lint & Types)...');
  logger.info('Running Linters and Quality Gates (Parallelized)...');

  const startTime: number = Date.now();
  // UI steps (linters, strict types, unit tests) can safely run concurrently in parallel
  const concurrentUiSteps = steps.filter(
    (s) =>
      !s.command.startsWith('cargo') &&
      s.name !== 'i18n Parity (10 Locales)' &&
      s.name !== 'Playwright (E2E React)'
  );
  const playwrightStep = steps.find((s) => s.name === 'Playwright (E2E React)');

  // Rust steps share the target/ lock directory and must run sequentially
  const rustSteps = steps.filter(
    (s) => s.command.startsWith('cargo') || s.name === 'i18n Parity (10 Locales)'
  );

  const [uiResults, rustResults] = await Promise.all([
    (async () => {
      const concurrentResults = await Promise.all(concurrentUiSteps.map((s) => runStep(s)));
      if (playwrightStep) {
        const pwResult = await runStep(playwrightStep);
        return [...concurrentResults, pwResult];
      }
      return concurrentResults;
    })(),
    (async () => {
      const res: StepResult[] = [];
      for (const step of rustSteps) {
        res.push(await runStep(step));
        if (process.platform === 'win32') {
          // Allow Windows file handles on target/ artifacts to fully release
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      return res;
    })(),
  ]);

  // Maintain original step ordering for reports
  const resultsMap = new Map<string, StepResult>();
  for (const r of [...uiResults, ...rustResults]) {
    resultsMap.set(r.step.name, r);
  }
  const results: StepResult[] = steps.map((s) => resultsMap.get(s.name)!);
  const elapsed: string = ((Date.now() - startTime) / 1000).toFixed(2);

  let allPassed: boolean = true;
  const failedSteps: StepResult[] = [];
  const reportLines: string[] = [
    '# VHS Studio Pro - Build & Quality Report',
    `**Date:** ${new Date().toISOString()}\n`,
    `**Execution Time:** ${elapsed}s\n`,
    '## Summary\n',
  ];

  for (const { step, passed, output } of results) {
    if (passed) {
      logger.success(`[${step.name}] PASSED`);
      reportLines.push(`- **${step.name}**: :white_check_mark: PASSED`);
    } else {
      logger.error(`[${step.name}] FAILED`);
      reportLines.push(`- **${step.name}**: :x: FAILED`);
      failedSteps.push({ step, passed, output });
      allPassed = false;
    }
  }

  reportLines.push('\n## Details\n');
  if (failedSteps.length > 0) {
    for (const { step, output } of failedSteps) {
      reportLines.push(`### ${step.name}`);
      reportLines.push('```text\n' + output + '\n```\n');
    }
  } else {
    reportLines.push('All quality checks passed perfectly. Zero regressions detected.\n');
  }

  const logsDir: string = path.join(PROJECT_ROOT, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, 'build_report.md'), reportLines.join('\n'), 'utf-8');

  if (!allPassed) {
    logger.error('=== REJECTED. FIX QUALITY GATE FAILURES BEFORE COMMITTING. ===');
    logger.error(`See detailed report at: ${path.join(logsDir, 'build_report.md')}`);
    process.exit(1);
  } else {
    logger.success(`=== ALL GATES PASSED IN ${elapsed}s. CODEBASE IS CLEAN! ===`);
    logger.info(`Build report generated at: ${path.join(logsDir, 'build_report.md')}`);
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  const message: string = err instanceof Error ? err.message : String(err);
  logger.error(`[FATAL] Quality Gate runner crashed: ${message}`);
  process.exit(1);
});

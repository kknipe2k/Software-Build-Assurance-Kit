#!/usr/bin/env node
// @kit-version 1.0.0
// scripts/verify-local.cjs
//
// The ONE local verification entrypoint (verification_locus: local_first | hybrid).
// Runs the full test suite on two surfaces in sequence and exits non-zero on the
// first failure:
//
//   1. Linux  — inside a Docker container mirroring the GitHub ubuntu image
//               (WSL2 fallback available via VERIFY_LINUX=wsl).
//   2. Native — the host OS this dev machine runs (Windows / macOS / Linux).
//
// This replaces the per-push cloud test matrix: Linux + the dev OS are proven
// here, for $0 GitHub Actions minutes. macOS packaging and the final cross-OS
// matrix run only on version tags (see .github/workflows/release.yml).
//
// Wired as the pre-push hook (.githooks/pre-push); a failing run blocks the push.
// Emergency override is `git push --no-verify` — logged, never routine; it cannot
// bypass the required PR check (see docs/gates.md).
//
// Cross-platform: pure Node + spawned shells. Node is already required by Claude
// Code, so there is no extra runtime to install.
//
// Usage:
//   node scripts/verify-local.cjs                    # both legs
//   VERIFY_LINUX=wsl node scripts/verify-local.cjs   # use WSL2 for the Linux leg
//   VERIFY_SKIP_LINUX=1 node scripts/verify-local.cjs # native only (emergency)
//
// Exits 0 only if every leg passes.

'use strict';

const { spawnSync, execSync } = require('child_process');

// ---- project configuration (filled at bootstrap) ----------------------------
const CONFIG = {
  // Docker image mirroring the GitHub ubuntu-latest toolchain for this stack.
  dockerImage: '{{DOCKER_IMAGE}}',              // e.g. 'node:20-bookworm'
  // The full test command, run inside the Linux container.
  // PATH-SCOPE it when the suite is Node's built-in runner (KF-48 instance 3, M27.D): a bare
  // `node --test` auto-discovers every Node-test-pattern file anywhere under the repo —
  // vendored trees like sbak/ included — polluting both the suite and the coverage
  // denominator. Use a QUOTED GLOB: node --test "tests/**/*.test.cjs". A bare directory
  // positional (`node --test tests`) is not a scoped run; current Node fails on it.
  linuxTestCommand: '{{LINUX_TEST_COMMAND}}',   // e.g. 'npm ci && npm test'
  // The full test command, run natively on this dev machine.
  nativeTestCommand: '{{NATIVE_TEST_COMMAND}}', // e.g. 'npm test'
};
// -----------------------------------------------------------------------------

const RED = '\x1b[31m', GREEN = '\x1b[32m', CYAN = '\x1b[36m', DIM = '\x1b[2m', RESET = '\x1b[0m';

function repoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return process.cwd();
  }
}

function have(bin) {
  return spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0;
}

// ERR-008: spawn with an ARGV ARRAY (shell:false), never a hand-assembled shell
// string. A test command with spaces / quotes / shell metacharacters is passed as a
// single discrete argv element to the chosen shell (sh -lc / cmd /c) and parsed by
// THAT shell once — no fragile outer-quote escaping that mis-parses at the gate.
function run(label, file, args, opts = {}) {
  console.log(`\n${CYAN}> ${label}${RESET}\n${DIM}$ ${file} ${args.join(' ')}${RESET}`);
  const r = spawnSync(file, args, { stdio: 'inherit', cwd: opts.cwd });
  const ok = r.status === 0;
  console.log(ok ? `${GREEN}OK ${label}${RESET}` : `${RED}FAIL ${label} (exit ${r.status})${RESET}`);
  return ok;
}

const root = repoRoot();
const legs = [];

// ---- leg 1: Linux ------------------------------------------------------------
if (process.env.VERIFY_SKIP_LINUX === '1') {
  console.log(`${RED}! Skipping the Linux leg (VERIFY_SKIP_LINUX=1). Emergency use only.${RESET}`);
} else if ((process.env.VERIFY_LINUX || 'docker') === 'wsl') {
  // WSL2 fallback. The test command is one argv element to `bash -lc` — the inner
  // bash parses it; no outer escaping. Adjust path handling for your WSL setup if needed.
  legs.push(['Linux (WSL2)', 'wsl', ['bash', '-lc', CONFIG.linuxTestCommand]]);
} else if (have('docker')) {
  // Each flag + value is its own argv element, so a mount path with spaces is safe
  // without quoting; the test command is one argv element to the container's `sh -lc`.
  legs.push([
    'Linux (Docker)', 'docker',
    ['run', '--rm', '-v', `${root}:/work`, '-w', '/work', CONFIG.dockerImage, 'sh', '-lc', CONFIG.linuxTestCommand],
  ]);
} else {
  console.error(`${RED}Docker not found.${RESET} The Linux leg needs Docker (it mirrors the GitHub ubuntu image).`);
  console.error(`Install Docker Desktop, or re-run with the WSL2 fallback:  ${DIM}VERIFY_LINUX=wsl node scripts/verify-local.cjs${RESET}`);
  process.exit(1);
}

// ---- leg 2: native -----------------------------------------------------------
// A compound native command (e.g. `npm ci && npm test`) needs a shell, so hand it to
// the platform shell as ONE argv element — cmd /c on Windows, sh -lc elsewhere —
// rather than a single shell-string assembled with hand-escaped quotes.
const [nativeShell, nativeShellArgs] = process.platform === 'win32'
  ? ['cmd', ['/c', CONFIG.nativeTestCommand]]
  : ['sh', ['-lc', CONFIG.nativeTestCommand]];
legs.push([`Native (${process.platform})`, nativeShell, nativeShellArgs]);

// ---- run sequentially, stop on first failure --------------------------------
console.log(`\n${CYAN}local verification — ${legs.length} leg(s)${RESET}`);
for (const [label, file, args] of legs) {
  if (!run(label, file, args, { cwd: root })) {
    console.error(`\n${RED}local verification FAILED at: ${label}${RESET}`);
    console.error(`${DIM}push blocked. Fix and re-push, or (emergency only) 'git push --no-verify'.${RESET}`);
    process.exit(1);
  }
}
console.log(`\n${GREEN}local verification passed — Linux + native green.${RESET}`);
process.exit(0);

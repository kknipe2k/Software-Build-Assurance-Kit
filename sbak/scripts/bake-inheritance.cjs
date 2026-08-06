#!/usr/bin/env node
// scripts/bake-inheritance.cjs
//
// THE INHERITANCE HARNESS — the G10 irony closed.
//
// The kit demands ASSEMBLED-EXECUTION proof from every project it builds (G10) but had
// never run its own bootstrap end-to-end — inheritance was asserted by template-wiring,
// never PROVEN. This harness closes that: it renders the deterministic Phase-3 scaffold
// into a throwaway project and proves each STATIC gate actually FIRES there — a planted
// violation in the baked project must BLOCK. EFFECTIVENESS, not presence: a present-but-
// dead (--neuter) validator must let its planted violation through so the harness goes
// RED — a file-exists harness is the exact theater this harness exists to kill.
//
// ── HONEST SCOPE (non-negotiable — no overclaim) ───────────────────────────────────────
//   • BAKES THE SCAFFOLD, NOT THE INTERVIEW. The harness renders the DETERMINISTIC part of
//     Phase 3 — the files the scaffold-generation tables copy to disk (validators/, the
//     .claude/hooks, prompts/calibration/) — and proves the gates fire on them. It does
//     NOT bake the conversational calibration interview: that is AGENT BEHAVIOR, not a
//     deterministic render. So this proves the WIRING inherits, not that the bootstrap
//     CONVERSATION reliably produces the wiring.
//   • WHERE THE BAKED FILES COME FROM (stated, because getting this wrong hid KF-01 for a
//     whole release). `prompts/calibration/` and the golden leg's rendered tree are sourced
//     from the ROW-SET (scripts/fixtures/golden-bootstrap/rows.json, overridable with --rows)
//     — the same contract a bootstrapped project is generated from, so a missing generation
//     row turns this harness RED. `validators/*.cjs` and `templates/dot-claude/hooks/*` are
//     still copied from the KIT TREE, because only the headline validators carry rows (the
//     rest are clone-inherited by design — see rows.json's ENUMERATION MODEL note). Read that
//     honestly: for those two sets this harness proves the gates FIRE once present, and
//     `validate-validator-enumeration.cjs` — not this file — is what proves they are
//     CATALOGUED. A kit-tree copy standing in for a generation row is exactly the mask that
//     let cluster C1 ship green; it is now confined to the sets named in this bullet.
//   • A CI INHERITANCE CHECK, NOT A NUMBERED GATE. It runs in the kit's CI
//     (.github/workflows/bake-and-test.yml), the append-only-ledger / app-map-currency
//     class — never on the per-stage numbered G-line.
//   • G10 BOUNDARY (assembled-execution is NOT bake-fired). G10's assembled-execution half
//     needs a REAL running app, so it cannot be fired by a planted static violation. Its
//     inheritance is proven by PRESENCE (validate-app-map.cjs is copied) + CI-wiring. What
//     the harness DOES fire is validate-app-map's STATIC test-id-binding floor (the
//     currency primitive): a `verified` map entry citing a dead test-id blocks. That is a
//     distinct, static check — not the assembled-execution evidence cell.
//
// ── WHAT IT PROVES FIRE (8 static gate checks, each: plant a violation → baked validator
//    must exit 1 = BLOCK) ───────────────────────────────────────────────────────────────
//   G9  validate-test-honesty       — an assertion-free test
//                                      (+ a NON-blocking inheritance check —
//                                       a baked validate-test-honesty must VISIBLY note a
//                                       non-JS assertion-free test on stderr, never a silent
//                                       pass. Asserted as a disclosure string, not a block.)
//   G11 validate-risk-escalation    — a declared risk trigger with no escalation record
//   G12 validate-destructive-op     — a destructive surface with rollback but NO confinement
//   G13 validate-risk-matrix        — a <risk_declaration> omitting matrix properties
//   G14 validate-calibration        — a "Sound" findings file with no calibration block
//   G15 validate-transition         — a truncate-then-write of a durable-state file
//   G16 validate-release-readiness  — a public-distribution claim w/ triggers + no review record
//                                      (+ a VALID multi-entry climb fixture, so the
//                                       block ISOLATES the missing-review check — the bake asserts
//                                       the review reason, not just exit 1. --g16-wrong-reason
//                                       swaps in the old continuity-blocking ledger to prove it.)
//   app-map (G10 STATIC floor)      — a `verified` entry citing a dead test-id
//
// Usage:
//   node scripts/bake-inheritance.cjs [--root <dir>] [--neuter <validator.cjs>] [--omit <v.cjs>] [--keep]
//     --root <dir>      source root to render from (default: the kit root). A nonexistent /
//                       unreadable root → fail-closed exit 2.
//     --neuter <v.cjs>  after baking, overwrite the named validator in the BAKED copy with a
//                       no-op (present-but-dead) → its gate will not fire → harness RED. The
//                       falsifiability self-proof (effectiveness, not presence).
//     --omit <v.cjs>    after baking, DELETE the named validator from the baked copy → the
//                       presence check fails → harness non-zero.
//     --rows <rows.json> the row-set the baked project's generated artifacts are sourced from
//                       (default: <root>/scripts/fixtures/golden-bootstrap/rows.json). Mirrors
//                       golden-bootstrap's --rows so ONE mutated row-set drives every consumer;
//                       dropping the prompts/calibration/ rows must turn this harness RED.
//     --keep            do not delete the baked temp dir (debug).
//
// Exit 0 = clean bake: every gate FIRED + the full validator set + hooks + calibration set
//          present. Exit 1 = a gate did NOT fire (RED) or a validator is missing. Exit 2 =
//          fail-closed (un-renderable source root).

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT_ROOT = path.resolve(__dirname, '..');
const FENCE = '`'.repeat(3); // a ```-fence built without nesting backticks in source

// The shared fixture-confinement primitive (pure import — no
// side effects here; the env scrub runs inside the require.main-guarded body).
const sandbox = require('./lib/sandbox.cjs');

// ── copyTree — the render walk ─────────────────────────────────────────────────────────
// Recursively copy a tree (src must exist; the caller fail-closes if the render source is
// missing). BOUNDED + SYMLINK-SAFE:
//   • readdirSync(dir, { withFileTypes: true }) + Dirent.isDirectory() recurses ONLY into a
//     REAL directory. A symlink / Windows junction is Dirent.isDirectory()===false +
//     isSymbolicLink()===true, so it is NEVER followed — copyTree was once the
//     lone walk that followed symlinks via statSync, and a CYCLE under a copied root spun it
//     into unbounded recursion. statSync FOLLOWED the link; the Dirent type does not.
//   • a hard DEPTH CAP is the backstop for any non-symlink over-deep nest.
// VISIBILITY: a skipped symlink and a depth-cap breach each emit ONE loud
// line to stderr — a silently-vanished entry is the silent-drop shape this milestone kills. The
// kit scaffold is symlink-free, so a normal render emits NO such lines (byte-identical copy).
const MAX_COPY_DEPTH = 64; // well above the deepest real scaffold path; the bake still renders fully
function copyTree(src, dest, depth) {
  const d = depth || 0;
  if (d > MAX_COPY_DEPTH) {
    process.stderr.write(
      `copyTree: depth cap ${MAX_COPY_DEPTH} exceeded at ${src} — skipping (cycle / over-deep guard).\n`
    );
    return;
  }
  const st = fs.lstatSync(src); // lstat: classify the node itself, do NOT follow a symlink here
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      const cs = path.join(src, ent.name);
      const cd = path.join(dest, ent.name);
      if (ent.isSymbolicLink()) {
        // never follow a symlink/junction (cycle + out-of-tree escape guard) — skip it LOUDLY.
        process.stderr.write(`copyTree: skipping symlink '${cs}' (not followed — symlink-safe walk).\n`);
        continue;
      }
      if (ent.isDirectory()) {
        copyTree(cs, cd, d + 1);
      } else {
        fs.mkdirSync(path.dirname(cd), { recursive: true });
        fs.copyFileSync(cs, cd);
      }
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
// ── RECEIPTS LEG — capture→collect→render→link in the baked project ──────────────────────
// Runs INSIDE a rendered/baked tree and proves the whole receipts pipeline inherits, with
// its two data paths NAMED (the red-approved design):
//   • EVENT path — synthesized payloads drive the baked ADAPTER host-faithfully: the leg
//     enumerates which lifecycle boundaries register receipts-lifecycle.cjs in the baked
//     .claude/settings.json and fires ONLY those (a host never invokes an unregistered
//     hook). A missing registration is therefore a NAMED, visible coverage-gap finding —
//     deleting the Stop registration REDs this leg (inheritance has teeth), it never
//     silently passes. Feeds timeline/roles/coverage.
//   • COLLECTOR path — a BOUNDED fixture-history synthesizer: a small git-bearing fixture
//     repo built under sandbox.fixtureEnv INSIDE the baked tree (two commits, one retro
//     with rework block + stamp + budget + RED-first, one CHANGELOG entry, one 🔴
//     V-finding). Feeds bau/worked/broke/shipped.
// Then the BAKED project's own scripts/build-receipts.cjs runs render + --check in the
// fixture repo — the inheritance under test is the baked copy, never the kit's.
// Every check routes through legAssert (vacating it is the mut4 the smoke's
// inheritance-teeth lock kills). Returns { findings, root, fixtureRepo, reportDir }.
function receiptsLeg(bakedRoot) {
  const findings = [];
  function legAssert(ok, msg) {
    if (!ok) findings.push(msg);
  }
  const res = { findings, root: bakedRoot, fixtureRepo: null, reportDir: null };
  try {
    // 1) registration enumeration — all 8 lifecycle boundaries must register the adapter.
    const REQUIRED = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Stop',
      'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
    let settings = null;
    try { settings = JSON.parse(fs.readFileSync(path.join(bakedRoot, '.claude', 'settings.json'), 'utf8')); } catch (_) { settings = null; }
    const registered = new Set();
    const hooksCfg = (settings && settings.hooks) || {};
    for (const ev of Object.keys(hooksCfg)) {
      for (const entry of hooksCfg[ev] || []) {
        if (((entry && entry.hooks) || []).some((h) => /receipts-lifecycle\.cjs/.test((h && h.command) || ''))) registered.add(ev);
      }
    }
    for (const ev of REQUIRED) {
      legAssert(registered.has(ev),
        `receipts leg — the ${ev} registration is MISSING from the baked .claude/settings.json: a VISIBLE coverage gap (` +
        (ev === 'Stop' ? 'turns would never complete — every interval incomplete' : 'events from this boundary are unobserved') +
        '); the capture surface does not inherit whole.');
    }

    // 2) the bounded fixture-history synthesizer (collector-fed sections).
    const fixtureRepo = path.join(bakedRoot, 'receipts-leg-fixture');
    res.fixtureRepo = fixtureRepo;
    fs.mkdirSync(fixtureRepo, { recursive: true });
    const gitEnv = Object.assign({}, sandbox.fixtureEnv(fixtureRepo), {
      GIT_AUTHOR_NAME: 'Leg Fixture', GIT_AUTHOR_EMAIL: 'leg@example.com',
      GIT_COMMITTER_NAME: 'Leg Fixture', GIT_COMMITTER_EMAIL: 'leg@example.com',
      GIT_AUTHOR_DATE: '2026-01-04T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-04T00:00:00Z',
    });
    const git = (args) => spawnSync('git', args, { cwd: fixtureRepo, encoding: 'utf8', env: gitEnv });
    git(['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(fixtureRepo, 'CHANGELOG.md'),
      '# Changelog\n\n### M01 — leg fixture milestone (2026-01-04)\n\n**Verdict: Sound** (FNR = 0/3).\n', 'utf8');
    fs.mkdirSync(path.join(fixtureRepo, 'retrospectives'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRepo, 'retrospectives', 'M01.A-retrospective.md'), [
      '# Retrospective: M01.A — leg fixture', '',
      '**Self-correction budget for this stage:** 3', '',
      '- [x] RED-first loop honored.', '',
      FENCE + 'rework', 'implementation: 1', 'verifier: 0', 'irl: 0', 'post-merge: 0', FENCE, '',
      FENCE + 'user-stamp', 'verdict: pass', FENCE, '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(fixtureRepo, 'retrospectives', 'M01.V-findings.md'),
      '# M01.V Findings\n\n## F1 — planted verifier finding \u{1F534}\nDetail.\n', 'utf8');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'M01.A: leg fixture surface']);
    fs.writeFileSync(path.join(fixtureRepo, 'notes.md'), 'tidy\n', 'utf8');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'chore: tidy the leg fixture']);

    // 3) the scripted fixture session (event-fed sections) — synthesized payloads drive
    // the baked adapter; only REGISTERED boundaries fire (host-faithful).
    const adapter = path.join(bakedRoot, '.claude', 'hooks', 'receipts-lifecycle.cjs');
    legAssert(fs.existsSync(adapter), 'receipts leg — the baked adapter .claude/hooks/receipts-lifecycle.cjs is missing.');
    // role: work — set via the baked sanctioned writer, run in the fixture repo (its
    // mode_set event is bonus; session env is blanked so the leg stays deterministic).
    const scriptEnv = Object.assign({}, sandbox.scrubGitEnv(), { CLAUDE_CODE_SESSION_ID: '' });
    spawnSync('node', [path.join(bakedRoot, 'scripts', 'set-mode.cjs'), 'work'],
      { cwd: fixtureRepo, encoding: 'utf8', env: scriptEnv });
    const SESSION = [
      { ev: 'SessionStart', payload: { source: 'startup' } },
      { ev: 'UserPromptSubmit', payload: {} },
      { ev: 'PreToolUse', payload: { tool_name: 'Bash', tool_input: { command: 'echo leg' } } },
      { ev: 'PostToolUse', payload: { tool_name: 'Bash' } },
      { ev: 'Stop', payload: {} },
      { ev: 'SessionEnd', payload: {} },
    ];
    for (const step of SESSION) {
      if (!registered.has(step.ev)) continue; // a host never invokes an unregistered hook
      const payload = Object.assign({ hook_event_name: step.ev, session_id: 'sLeg', cwd: fixtureRepo }, step.payload);
      const r = spawnSync('node', [adapter], { cwd: fixtureRepo, input: JSON.stringify(payload), encoding: 'utf8', env: scriptEnv });
      legAssert(r.status === 0, `receipts leg — the baked adapter exited ${r.status} on a ${step.ev} payload (must be 0).`);
    }

    // 4) render with the BAKED project's own CLI (the inheritance under test).
    const cli = path.join(bakedRoot, 'scripts', 'build-receipts.cjs');
    const render = spawnSync('node', [cli, 'render'], { cwd: fixtureRepo, encoding: 'utf8', env: scriptEnv });
    legAssert(render.status === 0,
      `receipts leg — the baked \`render\` exited ${render.status} in the fixture repo: ` +
      ((render.stderr || '') + (render.stdout || '')).slice(0, 300));
    const reportDir = path.join(fixtureRepo, 'reports');
    res.reportDir = reportDir;
    let model = null;
    try { model = JSON.parse(fs.readFileSync(path.join(reportDir, 'build-receipt.json'), 'utf8')); } catch (_) { model = null; }
    legAssert(model !== null, 'receipts leg — reports/build-receipt.json missing or unparseable after render.');

    // 5) content assertions — the four headline sections carry the NAMED synthesizer
    // content; the event-fed sections carry the scripted session (never a hand-built JSON).
    if (model) {
      const sec = (name) => JSON.stringify(model[name] || null);
      legAssert(/M01\.A/.test(sec('bau')), 'receipts leg — bau does not carry the in-budget M01.A stage-rework record (collector path broken).');
      legAssert(/RED-first/i.test(sec('worked')), 'receipts leg — worked does not carry the M01.A RED-first control (collector path broken).');
      legAssert(/planted verifier finding/i.test(sec('broke')), 'receipts leg — broke does not carry the planted verifier finding (collector path broken).');
      legAssert(/M01\.A/.test(sec('shipped')), 'receipts leg — shipped does not carry the M01.A stage commit (collector path broken).');
      const work = model.roles && model.roles.per_role && model.roles.per_role.work;
      legAssert(!!work && work.complete_turns >= 1,
        'receipts leg — the event-fed roles section carries no COMPLETE work turn from the scripted adapter session (event path broken' +
        (registered.has('Stop') ? '' : ' — Stop unregistered: the turn never completed, a visible coverage gap') + ').');
      legAssert(/"category":\s*"exec"/.test(JSON.stringify(model.timeline || null)),
        'receipts leg — the timeline carries no exec tool event from the scripted Bash payload (event path broken).');
      let html = null;
      try { html = fs.readFileSync(path.join(reportDir, 'build-receipt.html'), 'utf8'); } catch (_) { html = null; }
      legAssert(html !== null && !/<script\b/i.test(html) && /href="#rcpt-/.test(html) && /id="rcpt-/.test(html),
        'receipts leg — the HTML report is missing, carries a script tag, or has no claim→receipt links.');
    }

    // 6) the release preflight on the baked project.
    const chk = spawnSync('node', [cli, '--check'], { cwd: fixtureRepo, encoding: 'utf8', env: scriptEnv });
    legAssert(chk.status === 0 && /deterministic|byte-identical/i.test(chk.stdout || ''),
      `receipts leg — the baked build-receipts --check did not pass (exit ${chk.status}).`);
  } catch (e) {
    findings.push(`receipts leg — crashed: ${e && e.message ? e.message : e}`);
  }
  return res;
}

// Exported so the smoke rig can unit-test the walk directly (cycle-skip visibility + a
// byte-identical normal copy) and drive the receipts leg on a minimal rendered tree
// WITHOUT running the full bake. The executable bake body below is guarded by
// `require.main === module`, so requiring this file is a pure import.
module.exports = { copyTree, MAX_COPY_DEPTH, receiptsLeg };

let baked; // assigned in the executable body (guarded); referenced by write()/runBaked()

// ---- args ----
const argv = process.argv.slice(2);
function flagValue(name) {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
}
const root = path.resolve(flagValue('--root') || KIT_ROOT);
const neuter = flagValue('--neuter');
const omit = flagValue('--omit');
const keep = argv.includes('--keep');
// --g16-wrong-reason (falsifiability self-proof) — swap the G16 ISOLATION fixture for the
// OLD single-entry ledger (an unreached `Prior state` -> blocks via the F1 CONTINUITY check, not
// the missing-review check). A bake whose reason-assertion has teeth detects the wrong block
// reason and goes RED; reverting the reason-assertion lets this wrong-reason fixture pass.
const g16WrongReason = argv.includes('--g16-wrong-reason');
// --receipts-no-stop (falsifiability self-proof) — delete the Stop registration from
// the rendered .claude/settings.json before the receipts leg runs: the leg must RED with a
// NAMED visible coverage-gap finding (turns never complete). A leg that stays green with a
// dead registration is the silent-pass theater the inheritance-teeth lock exists to kill.
const receiptsNoStop = argv.includes('--receipts-no-stop');
// --rows <rows.json> — the row-set the bake sources its generated artifacts from. Mirrors
// golden-bootstrap's own --rows (and validate-validator-enumeration's), so ONE mutated rows.json
// drives the golden --diff, the enumeration lock AND this harness — the calibration-set
// mutation is the same file in all three. Resolved against `root` so a --root fixture tree brings
// its own row-set. Declared EXPLICITLY rather than leaning on golden-bootstrap picking --rows out
// of this process's shared argv: that leak works, but an undeclared dependency is not a contract.
const rowsPath = path.resolve(flagValue('--rows') || path.join(root, 'scripts/fixtures/golden-bootstrap/rows.json'));

// The calibration rows, read from the row-set — the ONLY source of the baked seeded-defect set.
// Fail-soft to []: a missing/unreadable row-set means the set does not render, which the presence
// check below reports as the finding it is. Never falls back to a kit-root copy (that was the mask).
function calibrationRows() {
  try {
    const gb = require(path.join(KIT_ROOT, 'scripts/golden-bootstrap.cjs')); // require.main-guarded → pure import
    return gb.loadRows(rowsPath).filter((r) => /^prompts\/calibration\//.test(r.file || '') && gb.applicable(r, 'full')); // two tiers post-collapse — 'full' is the merged default
  } catch (_) { return []; }
}

function failClosed(msg) {
  process.stderr.write(
    `BAKE FAIL (fail-closed)  ${msg}\n` +
    `      Refusing to claim inheritance from an un-renderable source root (exit 2).\n`
  );
  process.exit(2);
}

// ---- the executable bake (guarded so requiring this file is a pure import) ----
if (require.main === module) {

// Never trust the invoking (hook) git env — a linked-worktree pre-push exports
// an ABSOLUTE GIT_DIR that would otherwise reach every child this bake spawns.
sandbox.scrubProcessEnv();

// ---- the throwaway baked project ----
baked = sandbox.sandboxRoot('kit-bake-');
process.on('exit', () => {
  if (keep) return;
  try { fs.rmSync(baked, { recursive: true, force: true }); } catch (_) { /* best effort */ }
});

// ---- RENDER the deterministic scaffold (the files Phase 3 copies to disk) ----
const srcValidators = path.join(root, 'validators');
try {
  fs.accessSync(srcValidators);
} catch (_) {
  failClosed(`source root ${root} has no validators/ — cannot render the scaffold.`);
}
let shipped;
try {
  shipped = fs.readdirSync(srcValidators).filter((n) => /\.cjs$/.test(n));
} catch (e) {
  failClosed(`cannot enumerate ${srcValidators}: ${e && e.message ? e.message : 'unknown error'}`);
}

// The two-tier collapse (gate-1 hand-off 2, ratified): the KIT-SELF validators do NOT ship to projects —
// validate-validator-enumeration.cjs (dereferences templates/PROJECT-CLAUDE.md, absent in every
// project — the KF-36 defect mechanism) and validate-entry-docs.cjs (anchored to the kit's own
// entry-doc set). A project inheriting validators it can never run as gates is the
// unconsumed-artifact class. The exclusion list is MACHINE-READ from calibration-core.json
// kit_only_validators (a hand list here would be the C4 hand-carried-fact class); fail-closed —
// a bake without the core cannot know what ships, so it refuses rather than guesses.
let kitOnly;
try {
  kitOnly = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, 'calibration-core.json'), 'utf8')).kit_only_validators || [];
} catch (e) {
  failClosed(`calibration-core.json unreadable at kit root (${e && e.message}) — cannot derive the kit-only validator exclusion.`);
}
const shippedToProject = shipped.filter((n) => !kitOnly.includes(n));

// validators/*.cjs → baked/validators/ (copied unchanged, per the scaffold tables; minus the
// kit-only pair above — the baked count is len(all .cjs) - len(kit_only), honestly derived,
// never a frozen integer)
fs.mkdirSync(path.join(baked, 'validators'), { recursive: true });
for (const n of shippedToProject) fs.copyFileSync(path.join(srcValidators, n), path.join(baked, 'validators', n));

// The shared validators/lib/ (fenced-block.cjs and kin) rides along so the baked
// validators can require the primitive they now CONSUME (extend-not-fork). Without it a
// rewired validator would crash MODULE_NOT_FOUND in the baked project → its gate mis-fires.
const srcValidatorsLib = path.join(srcValidators, 'lib');
if (fs.existsSync(srcValidatorsLib)) copyTree(srcValidatorsLib, path.join(baked, 'validators', 'lib'));

// the .claude hooks → baked/.claude/hooks/ (best-effort: a source without them still bakes,
// but their presence is asserted below)
const srcHooks = path.join(root, 'templates', 'dot-claude', 'hooks');
try { copyTree(srcHooks, path.join(baked, '.claude', 'hooks')); } catch (_) { /* presence check reports it */ }

// prompts/calibration/ → baked/prompts/calibration/ (the seeded-defect set the V inherits),
// SOURCED FROM THE ROW-SET — never a kit-root tree-copy.
//
// THE MASK THIS REPLACES. This was once `copyTree(root/prompts/calibration, baked/…)`: a
// direct kit-root copy that bypassed the row-set entirely. It handed the baked project an artifact
// NO bootstrap step delivers, so the harness proved G14 fires against a set a real project never
// receives — a green bake coexisting with the sole blocks-any-release finding, for as long as the
// row was missing. Presence was inherited from the kit's own tree, not from the scaffold contract.
//
// Now the set arrives exactly as a bootstrapped project's does: via its generation rows. A dropped
// row therefore reaches the presence check below and the harness goes RED —
// `bake-inheritance.cjs --rows <rows-without-calibration>` is the standing mutation that proves it.
// This is also what makes the header's "renders the files the scaffold-generation tables copy to
// disk" claim TRUE of the calibration set, not just of the wiring.
for (const row of calibrationRows()) {
  const src = path.join(root, row.template);
  const dest = path.join(baked, row.file);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  } catch (_) { /* presence check reports it */ }
}

// ---- apply sabotage (the falsifiability self-proof) ----
if (neuter) {
  const p = path.join(baked, 'validators', neuter);
  // present-but-dead: a no-op that always passes. file-exists stays TRUE; the gate dies.
  fs.writeFileSync(p, '#!/usr/bin/env node\n// NEUTERED by bake-inheritance --neuter (present-but-dead)\nprocess.exit(0);\n');
}
if (omit) {
  try { fs.rmSync(path.join(baked, 'validators', omit), { force: true }); } catch (_) { /* fine */ }
}

const findings = [];

// ---- PRESENCE (necessary, not sufficient) ----
// The asserted set is shippedToProject — all validators/*.cjs MINUS the two kit-self
// validators the core names kit-only (validate-validator-enumeration.cjs, validate-entry-docs.cjs
// — hand-off 2, ratified). The count TIGHTENED honestly: the kit-only pair must be ABSENT from
// the bake (shipping them would be the unconsumed-artifact class reborn), never silently loosened.
for (const n of shippedToProject) {
  if (!fs.existsSync(path.join(baked, 'validators', n))) {
    findings.push(`missing validator ${n} — the baked project does not carry a shipped validators/*.cjs (inheritance broken).`);
  }
}
for (const n of kitOnly) {
  if (fs.existsSync(path.join(baked, 'validators', n))) {
    findings.push(`kit-only validator ${n} leaked into the baked project — calibration-core.json kit_only_validators excludes it from the scaffold (the calibration-core kit_only exclusion).`);
  }
}
if (!fs.existsSync(path.join(baked, '.claude', 'hooks', 'session-start-read-first.cjs'))) {
  findings.push('missing hook .claude/hooks/session-start-read-first.cjs in the baked project.');
}
if (!fs.existsSync(path.join(baked, 'prompts', 'calibration', 'fixtures'))) {
  findings.push('missing prompts/calibration/fixtures/ in the baked project — the seeded-defect set the V inherits.');
}
// ---- hook-text inheritance: a rendered project's hooks must remediate via the
// sanctioned `node scripts/set-mode.cjs`, NEVER teach the banned `echo > .claude/active-mode`
// truncate-write (the truncate-write race). Presence alone is not enough — the CORRECTED TEXT must
// inherit. (The golden manifest locks the rendered hooks byte-for-byte; this asserts the
// specific hook-text contract in the baked tree, and gives the "reintroduce a hook echo string"
// mutation its bake-side teeth: a regressed template would inherit the banned string here.)
for (const hook of ['session-start-read-first.cjs', 'user-prompt-submit-mode-check.cjs']) {
  const hp = path.join(baked, '.claude', 'hooks', hook);
  if (!fs.existsSync(hp)) continue; // presence handled above / by the hook-specific check
  const src = fs.readFileSync(hp, 'utf8');
  // Parameterized over BOTH role-marker names — a baked hook must teach neither
  // `> .claude/role` (the marker) nor its retired alias (the alias-window is closed; the
  // ban outlives the alias, because a stale tutorial can still teach the redirect).
  if (/>\s*\.claude\/(?:role|active-mode)\b/.test(src)) {
    findings.push(`hook-text inheritance broken — baked .claude/hooks/${hook} still teaches the banned truncate-write redirect to the role/mode file (must remediate via node scripts/set-mode.cjs).`);
  }
  if (!/set-mode\.cjs/.test(src)) {
    findings.push(`hook-text inheritance broken — baked .claude/hooks/${hook} does not name the sanctioned \`node scripts/set-mode.cjs\` remediation.`);
  }
}

// ---- helpers to plant fixtures + run the BAKED validator ----
function write(rel, body) {
  const p = path.join(baked, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}
// Run a baked validator. cwd = baked so a validator that walks the tree (validate-app-map)
// scans the baked project. Returns the exit code.
function runBaked(validator, args) {
  const r = spawnSync('node', [path.join(baked, 'validators', validator), ...args], {
    cwd: baked,
    encoding: 'utf8',
  });
  return r.status;
}

// A VALID multi-entry release-state CLIMB — each rung's `Prior state` is the rung
// below, genuinely REACHED by the preceding entry (so the F1 continuity check is satisfied), each
// release-end rung cites SLSA, ending at `public-distribution-ready` with ONLY the independent-
// review record missing. The FIRST entry is at the INTERNAL floor (`stage-complete`), so the
// no-bootstrap-into-a-release-state block never fires on the climb itself. A baked validator with
// triggers declared therefore blocks SOLELY via the missing-review check (entryMissingReview) —
// the fixture ISOLATES the review reason, unlike the old single-entry ledger whose unreached prior
// tripped the continuity check. (The capability triggers + the empty app-map are
// planted alongside via --config / --app-map by the caller.)
const G16_LADDER = [
  'stage-complete', 'milestone-complete', 'internally-usable',
  'source-release-ready', 'packaged-release-ready', 'public-distribution-ready',
];
function g16ValidClimb() {
  let s = '# Release-State Ladder\n\n';
  for (let i = 0; i < G16_LADDER.length; i++) {
    const st = G16_LADDER[i];
    const releaseEnd = st === 'packaged-release-ready' || st === 'public-distribution-ready';
    s += `## 2026-06-2${i} — reached \`${st}\` (climb step ${i})\n`;
    if (i > 0) s += `- Prior state: \`${G16_LADDER[i - 1]}\`\n`;
    if (releaseEnd) { s += '- SLSA build level: L2\n'; s += '- Rendered receipt: .claude/receipts/climb.html\n'; } // SLSA + receipt cited so ONLY the review is missing (KF-40 clause 4)
    // the final public-distribution-ready entry deliberately OMITS the independent-review record.
    s += `- Evidence: run https://ci/run/${i}\n`;
  }
  return s;
}
// The OLD single-entry fixture (an unreached `Prior` -> blocks via CONTINUITY, not review). Used
// only under --g16-wrong-reason to prove the isolation check's reason-assertion has teeth.
function g16WrongReasonLedger() {
  return '# Release-State Ladder\n\n' +
    '## 2026-06-29 — reached `public-distribution-ready` (v1)\n' +
    '- Prior state: `packaged-release-ready`\n' +
    '- SLSA build level: L2\n' +
    '- Evidence: run ref\n';
}

// ---- the 6 planted-violation gate checks (each must BLOCK = exit 1) ----
const GATES = [
  {
    gid: 'G9 (validate-test-honesty)',
    validator: 'validate-test-honesty.cjs',
    fire() {
      const f = write('g9-planted.test.js', "it('planted assertion-free test', () => { const x = 1; });\n");
      return runBaked('validate-test-honesty.cjs', [f]);
    },
  },
  {
    gid: 'G11 (validate-risk-escalation)',
    validator: 'validate-risk-escalation.cjs',
    fire() {
      const cfg = write('project-config.md', 'risk_triggers: [destructive_data_ops]\n');
      const gates = write('docs/gates.md', '# Gates\n\n(no escalation record for any trigger)\n');
      return runBaked('validate-risk-escalation.cjs', ['--gates', gates, cfg]);
    },
  },
  {
    gid: 'G12 (validate-destructive-op)',
    validator: 'validate-destructive-op.cjs',
    fire() {
      // destructive surface (basename `restore`) + a rollback test but NO confinement test.
      const f = write('restore.test.js', "it('restore rollback succeeds', () => { expect(undo()).toBe(true); });\n");
      return runBaked('validate-destructive-op.cjs', [f]);
    },
  },
  {
    gid: 'G13 (validate-risk-matrix)',
    validator: 'validate-risk-matrix.cjs',
    fire() {
      // banner-less (= current) Phase doc; a real risk surface that omits 8 of the 9 properties.
      const body =
        '# M99 planted\n\n' +
        FENCE + 'xml\n' +
        '<work_stage_prompt id="M99.A">\n' +
        '<risk_declaration triggers="secrets">\n' +
        '<property name="normal">covered-by: x — test: foo</property>\n' +
        '</risk_declaration>\n' +
        '</work_stage_prompt>\n' +
        FENCE + '\n';
      const f = write('docs/build-prompts/M99-planted.md', body);
      return runBaked('validate-risk-matrix.cjs', [f]);
    },
  },
  {
    gid: 'G14 (validate-calibration)',
    validator: 'validate-calibration.cjs',
    fire() {
      const body =
        '# M99.V Findings\n\n' + FENCE + 'verdict\nstatus: Sound\n' + FENCE + '\n\nNo calibration block present.\n';
      const f = write('M99.V-findings.md', body);
      return runBaked('validate-calibration.cjs', [f]);
    },
  },
  {
    gid: 'app-map G10-static (validate-app-map test-id binding)',
    validator: 'validate-app-map.cjs',
    fire() {
      // a `verified` entry citing a test-id that exists in NO test file → the static
      // currency floor blocks. (NOT the assembled-execution half — that needs a real app.)
      const body =
        '# App Map\n\n' +
        '| Surface | Test-id | State |\n' +
        '|---|---|---|\n' +
        '| thing | kit-bake-dead-testid-zzz | verified |\n';
      const f = write('docs/app-map.md', body);
      return runBaked('validate-app-map.cjs', [f]);
    },
  },
  {
    gid: 'G15 (validate-transition)',
    validator: 'validate-transition.cjs',
    fire() {
      // a NON-test source file doing a truncate-then-write of a durable-state file
      // (.claude/role) instead of write-temp-rename → the truncate-write race, blocked.
      // The fixture names the CANONICAL marker: when the guarded set narrowed, a fixture
      // on the retired name would prove the gate DEAD rather than live.
      const body =
        "'use strict';\n" +
        "const fs = require('fs');\n" +
        "function setMode(mode) { fs.writeFileSync('.claude/role', mode); }\n" +
        'module.exports = { setMode };\n';
      const f = write('set-role.cjs', body);
      return runBaked('validate-transition.cjs', [f]);
    },
  },
  {
    gid: 'G15 (validate-transition — the real red-gate markers)',
    validator: 'validate-transition.cjs',
    fire() {
      // The markers the red-gate ACTUALLY keys off — .claude/stage-active
      // (writer scripts/stage-active.cjs) and .claude/red-approved (writer approve-red.cjs). The
      // pre-fix regex guarded the reversed phantom 'active-stage' and missed 'red-approved', so a
      // truncate-write of either sailed through. A baked project must inherit the CORRECTED guard:
      // a non-test source truncate-writing either marker → block.
      const body =
        "'use strict';\n" +
        "const fs = require('fs');\n" +
        "function openStage(id) { fs.writeFileSync('.claude/stage-active', id); }\n" +
        "function approve(id) { fs.writeFileSync('.claude/red-approved', id); }\n" +
        'module.exports = { openStage, approve };\n';
      const f = write('open-stage.cjs', body);
      return runBaked('validate-transition.cjs', [f]);
    },
  },
  {
    gid: 'G16 (validate-release-readiness)',
    validator: 'validate-release-readiness.cjs',
    fire() {
      // a VALID multi-entry climb ending at `public-distribution-ready` with
      // DECLARED capability triggers + SLSA cited and ONLY the independent-review record missing
      // → the capability-triggered release-review gate must BLOCK, and (per the isolation check
      // after this loop) block SOLELY via the missing-review check — not the F1 continuity check
      // the OLD single-entry fixture tripped. (--config + --app-map passed explicitly
      // so the planted fixture is what the baked validator reads, not the baked project's files.)
      const cfg = write('g16-config.md', 'risk_triggers: [credentials]\n');
      const map = write('g16-app-map.md', '# App Map\n\n(no surfaces)\n');
      const ledger = write('g16-release-state.md', g16ValidClimb());
      return runBaked('validate-release-readiness.cjs', ['--config', cfg, '--app-map', map, ledger]);
    },
  },
];

for (const g of GATES) {
  // If this gate's validator was OMITTED, the presence check already reported it; running a
  // deleted file would mis-read as "fired" (node's module error is also exit 1), so skip the
  // effectiveness run for an omitted validator and let presence own that failure.
  if (omit && g.validator === omit) continue;
  const code = g.fire();
  if (code !== 1) {
    findings.push(
      `gate ${g.gid} did NOT fire on its planted violation — the baked ${g.validator} exited ${code}, ` +
      `expected 1 (BLOCK). A present-but-dead validator passing a planted violation is the presence-≠-` +
      `effectiveness theater this harness exists to kill.`
    );
  }
}

// ---- stack-aware G9 inherits — Python BLOCKS, Ruby is disclosed ----
// The visible skip GRADUATED for Python/Go/Rust (real per-language evaluation).
// Two distinct inherited behaviors, both proven in the baked copy:
//   (a) a planted assert-free .py test must BLOCK (exit 1) — the stack-aware gate inherits;
//   (b) a genuinely-other stack (.rb) keeps the VISIBLE "not evaluated" disclosure on stderr,
//       non-blocking — the visible-skip honesty survives exactly where coverage still ends.
// (Skipped when that validator was --omit'd: presence already owns it.)
if (omit !== 'validate-test-honesty.cjs') {
  const fPy = write('g9-stack-planted_test.py', 'def test_planted():\n    x = compute()\n'); // no assert
  const rPy = spawnSync('node', [path.join(baked, 'validators', 'validate-test-honesty.cjs'), fPy], {
    cwd: baked,
    encoding: 'utf8',
  });
  if (rPy.status !== 1) {
    findings.push(
      `G9 stack-aware coverage did NOT inherit — the baked validate-test-honesty exited ` +
      `${rPy.status} (expected 1 = BLOCK) on a planted assert-free .py test. The Python evaluation ` +
      `that replaced the earlier visible skip must fire in a generated project, not only in the kit.`
    );
  }
  const fRb = write('g9-other-planted_spec.rb', "describe 'x' do\n  it 'computes' do\n    compute\n  end\nend\n");
  const rRb = spawnSync('node', [path.join(baked, 'validators', 'validate-test-honesty.cjs'), fRb], {
    cwd: baked,
    encoding: 'utf8',
  });
  const outRb = (rRb.stdout || '') + (rRb.stderr || '');
  if (rRb.status !== 0 || !/assertion-honesty not evaluated/i.test(outRb)) {
    findings.push(
      `G9 genuinely-other visible-skip did NOT inherit — the baked ` +
      `validate-test-honesty must emit the "assertion-honesty not evaluated" disclosure on a .rb ` +
      `spec (non-blocking), never a silent pass or a false block. Got exit ${rRb.status}.`
    );
  }
}

// ---- the inline rework-fence SKIP inherits (a NON-block, not a gate) ----
// An ILLUSTRATIVE inline ```rework fence in prose is not a real declaration, so the baked
// validate-transition must NOT block it — the false-positive that kept recurring. The fence
// here is mid-line (text precedes it) so the line-anchored extract skips it; the line-anchor
// + four-type-body fix is what makes this pass. This proves the hardened behavior
// inherits into a generated project. (Skipped when that validator was --omit'd: presence
// already owns it.)
if (omit !== 'validate-transition.cjs') {
  const f = write('m14b-inline-rework-prose.md',
    '# Changelog\n\n' +
    'Hardened the inline ```rework fence match. Example follows:\n\n' +
    '```text\n' +
    'implementation: 1\n' +
    '```\n');
  const code = runBaked('validate-transition.cjs', [f]);
  if (code !== 0) {
    findings.push(
      `inline rework-fence skip did NOT inherit — the baked validate-transition exited ${code} ` +
      `(expected 0) on an illustrative inline ` + FENCE + `rework fence in prose. A false-positive block ` +
      `on a doc that merely MENTIONS a rework fence is the exact friction the line-anchor fix removes (it kept recurring).`
    );
  }
}

// ---- the G16 fixture FIRES *and ISOLATES* the missing-review check ----
// The G16 gate above proves the validator BLOCKS (exit 1). But the OLD single-entry fixture (an
// unreached `Prior state`) blocked via the F1 CONTINUITY check, not the missing-review
// check — so an exit-1 FIRE check no longer tested what "G16 inherits" claims (a coupling
// regression). Here the bake ASSERTS THE BLOCK REASON on the rebuilt valid-climb fixture: the
// independent-review token must be PRESENT and the continuity token ABSENT, so the block is SOLELY
// the missing-review check. --g16-wrong-reason swaps in the old single-entry ledger (blocks via
// continuity) to prove this reason-assertion has teeth (the --neuter analog for the reason).
// (Skipped when that validator was --omit'd: the file is gone and presence already owns it.)
if (omit !== 'validate-release-readiness.cjs') {
  const cfg = write('g16-iso-config.md', 'risk_triggers: [credentials]\n');
  const map = write('g16-iso-app-map.md', '# App Map\n\n(no surfaces)\n');
  const ledger = write('g16-iso-release-state.md', g16WrongReason ? g16WrongReasonLedger() : g16ValidClimb());
  const r = spawnSync('node',
    [path.join(baked, 'validators', 'validate-release-readiness.cjs'), '--config', cfg, '--app-map', map, ledger],
    { cwd: baked, encoding: 'utf8' });
  const out = (r.stderr || '') + (r.stdout || '');
  const blockedViaReview = r.status === 1 && /independent/i.test(out) && /review/i.test(out);
  const viaContinuity = /never reached|continuity|climbed earlier/i.test(out);
  if (!blockedViaReview || viaContinuity) {
    findings.push(
      `G16 fixture did NOT fire+ISOLATE the missing-review check — the baked ` +
      `validate-release-readiness ${r.status === 1 ? 'blocked' : `exited ${r.status} (expected 1=BLOCK)`} ` +
      `${blockedViaReview ? '' : 'WITHOUT the independent-review reason '}` +
      `${viaContinuity ? 'and via the CONTINUITY reason instead ' : ''}` +
      `— the rebuilt G16 fixture must block SOLELY via the missing-review check (a block for the ` +
      `continuity reason is the F1-fix coupling regression this check closes; "G16 inherits" must test the ` +
      `review check, not an incidental violation).`
    );
  }
}

// ---- GOLDEN LEG — the rendered red-gate FIRES in a bootstrapped project ----
// The problem: templates/scripts/ ships no set-mode/stage-active/approve-red, so a bootstrapped
// project's /stage can never write .claude/stage-active → the red-gate is fail-open FOREVER
// (dormant, silently). This leg renders a STANDARD reference project via the golden bootstrap
// (extend-not-fork — reuse the golden renderer, no second render path) and proves the red-gate's BLOCKING
// BEHAVIOR in the rendered tree — NOT the presence of the hook file:
//   1) open stage + no approval  → an impl-path edit is BLOCKED  (exit 2)  ← the gate is LIVE
//   2) after approve-red          → the same edit is ALLOWED     (exit 0)  ← the gate releases
//   3) after --clear (stage ends) → dormant → ALLOWED            (exit 0)  ← clearing disengages it
//   4) re-open a fresh stage      → BLOCKED again                (exit 2)  ← approval never persists
// It ALSO asserts the WIRING resolves (the rendered .claude/settings.json wires PreToolUse → the
// red-gate hook that exists in the render); stripping that wiring turns this leg RED (the wiring
// half). HONEST LOCUS: proves the rendered scaffold's red-gate CONTRACT (wired + fires), never
// "bootstrap verified". The leg runs ENTIRELY inside its own rendered temp tree (its own .claude/,
// cwd = rendered) so it never touches the kit's live .claude state (the golden-leg gotcha).
// NOTE on state (3): the shipped hook goes DORMANT (allow) when no stage is open — so "--clear →
// blocked" from the review's journey is realised as (3) clear→dormant + (4) reopen→re-block (a fresh
// /stage re-arms the gate). Asserting a block on a stage-less tree would assert a bug; (4) is the
// honest "re-locks" proof.
try {
  const gb = require(path.join(KIT_ROOT, 'scripts/golden-bootstrap.cjs')); // require.main-guarded → pure import
  const goldenRoot = sandbox.sandboxRoot('kit-golden-leg-');
  process.on('exit', () => { if (keep) return; try { fs.rmSync(goldenRoot, { recursive: true, force: true }); } catch (_) { /* best effort */ } });
  gb.renderTier('full', goldenRoot); // render the deterministic Full (merged default) scaffold into its own tree

  const implRel = 'src/feature-impl.cjs'; // an IMPLEMENTATION path (not test/doc/.claude) → gated
  const implAbs = path.join(goldenRoot, implRel);

  // Invoke the RENDERED red-gate hook directly with a PreToolUse payload (the bake can't run Claude
  // Code). Returns the hook's exit code (2 = BLOCK, 0/other = ALLOW).
  function redGate() {
    const payload = JSON.stringify({ cwd: goldenRoot, tool_input: { file_path: implAbs } });
    const r = spawnSync('node', [path.join(goldenRoot, '.claude', 'hooks', 'pretooluse-red-gate.cjs')],
      { cwd: goldenRoot, input: payload, encoding: 'utf8' });
    return r.status;
  }
  function runRendered(scriptRel, args) {
    const r = spawnSync('node', [path.join(goldenRoot, scriptRel), ...(args || [])],
      { cwd: goldenRoot, encoding: 'utf8' });
    return r.status;
  }

  // WIRING: the rendered settings.json must wire PreToolUse → the red-gate hook (else the gate never
  // fires in a real bootstrapped session, however correct the hook logic is — the wiring half).
  let wired = false;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(goldenRoot, '.claude', 'settings.json'), 'utf8'));
    const pt = (s.hooks && s.hooks.PreToolUse) || [];
    wired = pt.some((e) => ((e && e.hooks) || []).some((h) => /pretooluse-red-gate\.cjs/.test((h && h.command) || '')));
  } catch (_) { wired = false; }
  if (!wired) {
    findings.push(
      'golden leg — the rendered .claude/settings.json does NOT wire PreToolUse → ' +
      'pretooluse-red-gate.cjs; the red-gate would never fire in a bootstrapped session (the wiring half).'
    );
  }

  // WIRING-SCOPE: the rendered settings.json must wire the receipts adapter on a BROAD
  // PreToolUse matcher ALONGSIDE the edit-scoped red-gate — a Bash payload must reach the adapter
  // (tool_started), not be silently dropped by the red-gate's Edit|Write matcher. This is the
  // rendered-surface half of the smoke's wiring-scope lock: it proves the capture fires for a
  // NON-edit tool AND that the adapter actually APPENDS (behaviour, not file presence), persisting
  // only the bounded tool_category (never the tool name). Runs entirely inside the rendered tree.
  try {
    const s = JSON.parse(fs.readFileSync(path.join(goldenRoot, '.claude', 'settings.json'), 'utf8'));
    const pt = (s.hooks && s.hooks.PreToolUse) || [];
    const adEntry = pt.find((e) => ((e && e.hooks) || []).some((h) => /receipts-lifecycle\.cjs/.test((h && h.command) || '')));
    const rgEntry = pt.find((e) => ((e && e.hooks) || []).some((h) => /pretooluse-red-gate\.cjs/.test((h && h.command) || '')));
    let adFires = false; let rgFires = false;
    try { adFires = !!adEntry && new RegExp('^(?:' + adEntry.matcher + ')$').test('Bash'); } catch (_) { adFires = false; }
    try { rgFires = !!rgEntry && new RegExp('^(?:' + (rgEntry.matcher || '') + ')$').test('Bash'); } catch (_) { rgFires = false; }
    if (!adEntry || adFires !== true || rgFires !== false) {
      findings.push(
        'golden leg — the rendered .claude/settings.json does NOT wire a BROAD PreToolUse ' +
        'entry (matcher fires for Bash) to receipts-lifecycle.cjs alongside the edit-scoped red-gate; ' +
        'tool_started would never fire for Bash/Read/Grep (the wiring-scope half).'
      );
    } else {
      const r = spawnSync('node', [path.join(goldenRoot, '.claude', 'hooks', 'receipts-lifecycle.cjs')], {
        cwd: goldenRoot,
        input: JSON.stringify({ cwd: goldenRoot, session_id: 'sBake', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hi' } }),
        encoding: 'utf8',
      });
      let fired = false; let leaked = false;
      try {
        const led = fs.readFileSync(path.join(goldenRoot, '.claude', 'receipts', 'events-sBake.jsonl'), 'utf8');
        fired = /"event":"tool_started"/.test(led) && /"tool_category":"exec"/.test(led);
        leaked = /Bash|echo hi|command/.test(led);
      } catch (_) { fired = false; }
      if (r.status !== 0 || !fired || leaked) {
        findings.push(
          `golden leg — the rendered receipts adapter did NOT capture a Bash PreToolUse as a ` +
          `tool_started/exec event (exit ${r.status}, fired ${fired}, leaked ${leaked}); the broad-matcher ` +
          `capture must fire for non-edit tools and persist ONLY the bounded category (never tool_name).`
        );
      }
    }
  } catch (_) {
    findings.push('golden leg — could not evaluate the rendered receipts wiring-scope (settings.json unreadable).');
  }

  // Drive the lifecycle inside the rendered tree.
  runRendered('scripts/stage-active.cjs', ['M01.A']); // 1) open, un-approved
  const s1 = redGate();
  runRendered('scripts/approve-red.cjs', []);         // 2) human approves the RED
  const s2 = redGate();
  runRendered('scripts/stage-active.cjs', ['--clear']); // 3) stage closed → dormant
  const s3 = redGate();
  runRendered('scripts/stage-active.cjs', ['M01.A']); // 4) re-open a fresh stage → re-armed
  const s4 = redGate();

  if (s1 !== 2) {
    findings.push(
      `golden leg — the rendered red-gate did NOT block a pre-approval implementation edit ` +
      `(stage open, un-approved): pretooluse-red-gate.cjs exited ${s1}, expected 2 (BLOCK). This is the ` +
      `dormant-red-gate risk — without templates/scripts/stage-active.cjs the rendered /stage ` +
      `cannot write .claude/stage-active, so the flagship TDD gate is fail-open. (Behavior, not hook-file presence.)`
    );
  }
  if (s2 !== 0) {
    findings.push(
      `golden leg — after approve-red the rendered red-gate did NOT allow the edit: exited ${s2}, ` +
      `expected 0 (ALLOW). The gate must release implementation edits for the approved stage.`
    );
  }
  if (s3 !== 0) {
    findings.push(
      `golden leg — after --clear (stage ended) the rendered red-gate did NOT go dormant: exited ${s3}, ` +
      `expected 0 (ALLOW). Clearing the open-stage marker must disengage the gate.`
    );
  }
  if (s4 !== 2) {
    findings.push(
      `golden leg — re-opening a fresh stage did NOT re-block the pre-approval edit: exited ${s4}, ` +
      `expected 2 (BLOCK). Approval must not persist across stages (stage-active.cjs clears red-approved on open) — ` +
      `this is the "re-locks" half of the review's broken /stage journey.`
    );
  }

  // ---- MINI-SMOKE LEG — the baked project runs its OWN mini-smoke ----
  // 1) green out of the box on the rendered Standard tree; 2) a BROKEN (present-but-dead)
  // hook must turn it RED — effectiveness downstream, not presence (the effectiveness discipline
  // shipped to the project itself). Runs after the red-gate lifecycle above (which left the
  // tree with an open stage — harmless: the mini-smoke drives its own sandbox fixtures).
  runRendered('scripts/stage-active.cjs', ['--clear']); // tidy: close the lifecycle's stage
  const miniSmoke = () => spawnSync('node', [path.join(goldenRoot, 'scripts', 'smoke-project.cjs')],
    { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });
  let msr = miniSmoke();
  if (msr.status !== 0) {
    const failLines = ((msr.stdout || '') + (msr.stderr || '')).split('\n').filter((l) => /^FAIL/.test(l)).join('; ');
    findings.push(
      `mini-smoke leg — the baked project's OWN mini-smoke did NOT run green out of the box ` +
      `(exit ${msr.status}): ${failLines || 'no FAIL lines captured'}. A generated project must be able to ` +
      `regression-test its inherited enforcement locally.`
    );
  }
  // present-but-dead red-gate hook -> the mini-smoke's failing-case teeth must go RED.
  fs.writeFileSync(path.join(goldenRoot, '.claude', 'hooks', 'pretooluse-red-gate.cjs'),
    '#!/usr/bin/env node\n// broken by bake-inheritance (present-but-dead)\nprocess.exit(0);\n');
  msr = miniSmoke();
  if (msr.status === 0) {
    findings.push(
      'mini-smoke leg — a BROKEN (present-but-dead) red-gate hook did NOT turn the baked ' +
      "project's mini-smoke RED. Vacuous failing-case assertions are the mutation-3 theater this leg exists to kill."
    );
  }

  // ---- RECEIPTS LEG — the rendered project captures, collects, renders, links ----
  // Data paths NAMED (red-approved): synthesized adapter payloads feed the EVENT sections;
  // the bounded fixture-history synthesizer feeds the COLLECTOR sections. Under
  // --receipts-no-stop the Stop registration is deleted first — the leg must RED.
  if (receiptsNoStop) {
    const spr = path.join(goldenRoot, '.claude', 'settings.json');
    const sj = JSON.parse(fs.readFileSync(spr, 'utf8'));
    if (sj.hooks) delete sj.hooks.Stop;
    fs.writeFileSync(spr, JSON.stringify(sj, null, 2), 'utf8');
  }
  const legRes = receiptsLeg(goldenRoot);
  for (const lf of legRes.findings) findings.push(lf);

  // ---- SPEC-EXAMPLE HARVEST LEG (KF-53 instance 1; the baked-inheritance pin) ----
  // The trial's ONLY wrong-result escape was the spec's own literal example — nested
  // emphasis, `**bold *italic* code***` — missed by BOTH arms and caught only by held-back
  // fixtures. The gate that closes it is worth nothing as a workshop script: it has to
  // enforce in the GENERATED project, which is the KF-48 lesson. So this leg runs the BAKED
  // project's OWN copy against a planted violation in the baked tree.
  //
  // Mutation targets, both required by the harvest gate's own RED contract:
  //   • drop the validators/validate-spec-examples.cjs row from rows.json → the structural
  //     pin below REDs (the baked project never receives the gate), and
  //   • --neuter validate-spec-examples.cjs → the planted example sails through → RED.
  //     The top-of-file sabotage writes into `baked`, which is materialised BEFORE this
  //     rendered tree exists, so it never reached this copy; the leg re-applies it to its
  //     own tree. Without that, a present-but-dead validator would read green here — the
  //     exact presence-for-effectiveness theatre the whole harness exists to kill.
  {
    const specExRel = path.join('validators', 'validate-spec-examples.cjs');
    const specExAbs = path.join(goldenRoot, specExRel);
    if (!fs.existsSync(specExAbs)) {
      findings.push(
        'spec-example harvest leg — the baked project does NOT carry validators/validate-spec-examples.cjs ' +
        '(the KF-53.1 harvest gate has no rows.json row); its spec examples are demanded by nothing, which ' +
        'is the state the md2page escape happened in.'
      );
    } else {
      if (neuter === 'validate-spec-examples.cjs') {
        fs.writeFileSync(specExAbs,
          '#!/usr/bin/env node\n// NEUTERED by bake-inheritance --neuter (present-but-dead)\nprocess.exit(0);\n');
      }
      // The planted violation IS the trial's escaped shape: a literal example under an
      // Examples heading, absent from a real, otherwise-passing test surface.
      const escaped = '**bold *italic* code***';
      fs.mkdirSync(path.join(goldenRoot, 'spec'), { recursive: true });
      fs.mkdirSync(path.join(goldenRoot, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(goldenRoot, 'spec', 'project-spec.md'),
        '# baked project — spec\n\n## Examples\n\n'
        + '- `' + escaped + '` renders as bold containing italic.\n'
        + '- `# Heading` renders as an h1.\n', 'utf8');
      fs.writeFileSync(path.join(goldenRoot, 'tests', 'render.test.cjs'),
        "const assert = require('assert');\n"
        + "assert.strictEqual(render('# Heading'), '<h1>Heading</h1>');\n", 'utf8');
      const hv = spawnSync('node', [specExAbs],
        { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });
      const hvOut = String(hv.stdout || '') + String(hv.stderr || '');
      if (hv.status === 0 || !/MISSING/.test(hvOut) || hvOut.indexOf(escaped) === -1) {
        findings.push(
          `spec-example harvest leg — the BAKED validators/validate-spec-examples.cjs did not block the ` +
          `planted unfixtured spec example (exit ${hv.status}, named the example ${hvOut.indexOf(escaped) !== -1}). ` +
          `The generated copy must demand that a spec's literal examples reach the test surface (KF-53.1); ` +
          `a present-but-dead gate here reproduces the trial's only wrong-result escape.`
        );
      }
      // Clean up the plant so no later leg inherits a spec/tests tree it never expected.
      try { fs.rmSync(path.join(goldenRoot, 'spec'), { recursive: true, force: true }); } catch (_) { /* best effort */ }
      try { fs.rmSync(path.join(goldenRoot, 'tests'), { recursive: true, force: true }); } catch (_) { /* best effort */ }
    }
  }

  // ---- SETTINGS-MERGE LEG (KF-56; the baked-inheritance pin) ----
  // The baked project's OWN scripts/kit-update.cjs must perform the verified
  // settings merge: plant a user settings file, adopt with the kit as template
  // source, and require a NON-EMPTY derived kit registration set plus a
  // byte-exact archive — an empty derivation that silently merges nothing is
  // the fail-open class this leg exists to catch. Cross-platform (JSON
  // semantics). Runs after the receipts leg (which needs the rendered
  // settings.json untouched) and before the terminal hook-chmod leg.
  // Mutation target: drop the scripts/lib/settings-merge.cjs row from rows.json
  // → the structural pin REDs AND the baked kit-update crashes on require → RED.
  {
    if (!fs.existsSync(path.join(goldenRoot, 'scripts', 'lib', 'settings-merge.cjs'))) {
      findings.push(
        'settings-merge leg — the baked project does NOT carry scripts/lib/settings-merge.cjs (the KF-56 ' +
        'merge helper has no rows.json row); its kit-update cannot perform the verified settings merge ' +
        '(or crashes on require) exactly where the activation gap lives.'
      );
    }
    const bakedUserSettings = '{\n  "_marker": "baked-user-settings",\n  "permissions": { "allow": ["Bash(npm test)"] }\n}\n';
    const spr = path.join(goldenRoot, '.claude', 'settings.json');
    fs.writeFileSync(spr, bakedUserSettings, 'utf8');
    fs.copyFileSync(path.join(KIT_ROOT, 'release-manifest.json'), path.join(goldenRoot, 'release-manifest.json'));
    // The fixture is made a REAL repository before this adopt. THE RULE: --adopt is
    // fail-closed on hook activation, so a successful exit means every required enforcement
    // layer is live — which a git-less directory can never satisfy. This leg used to run in
    // one and assert exit 0, true only while adoption soft-succeeded with the hook layer
    // inactive. The fix is to give the leg the state a real adopted project is in, NOT to
    // relax the assertion: `kuS.status === 0` below is unchanged and still load-bearing.
    // (`git init` is idempotent — the leg at the foot of this file re-inits the same root
    // and is unaffected.)
    spawnSync('git', ['init', '-q'], { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });
    const kuS = spawnSync('node', [path.join(goldenRoot, 'scripts', 'kit-update.cjs'), '--adopt', '--kit', KIT_ROOT],
      { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });
    let mergedS = null;
    try { mergedS = JSON.parse(fs.readFileSync(spr, 'utf8')); } catch (_) { mergedS = null; }
    const mergedCmds = new Set();
    for (const ev of Object.keys((mergedS && mergedS.hooks) || {})) {
      for (const grp of mergedS.hooks[ev] || []) {
        for (const h of (grp && grp.hooks) || []) {
          if (h && typeof h.command === 'string') mergedCmds.add(h.command.trim().replace(/\s+/g, ' '));
        }
      }
    }
    const archDirS = path.join(goldenRoot, '.claude', 'settings.archive');
    const archivedS = fs.existsSync(archDirS)
      && fs.readdirSync(archDirS).some((n) => /\.settings\.json$/.test(n)
        && fs.readFileSync(path.join(archDirS, n), 'utf8') === bakedUserSettings);
    if (!(kuS.status === 0 && mergedCmds.size >= 4 && mergedS && mergedS._marker === 'baked-user-settings' && archivedS)) {
      findings.push(
        `settings-merge leg — the BAKED scripts/kit-update.cjs --adopt did not perform the verified merge ` +
        `(exit ${kuS.status}, distinct hook commands ${mergedCmds.size} — need >=4 = a NON-EMPTY derived set, ` +
        `user key survived ${!!(mergedS && mergedS._marker === 'baked-user-settings')}, byte-exact archive ${archivedS}). ` +
        `The generated copy must derive the kit registration set in ITS OWN layout and merge recoverably (KF-56); ` +
        `an empty derivation that merges nothing is the fail-open class.\n` +
        `--- baked adopt stdout ---\n${(kuS.stdout || '(empty)').trim()}\n` +
        `--- baked adopt stderr ---\n${(kuS.stderr || '(empty)').trim()}`
      );
    }
  }

  // ---- HOOK-CHMOD CONFINEMENT LEG (KF-55; the baked-inheritance pin) ----
  // Baked inheritance is a PIN, not parity prose: the BAKED project's own generated
  // install-hooks.cjs + kit-update.cjs must refuse a planted .githooks symlink — the
  // generated copies, not workshop bytes. Runs LAST (terminal leg): it git-inits the
  // rendered tree and plants symlinks, mutations no earlier leg may observe.
  // Mutation target: drop the scripts/lib/hook-chmod.cjs row from rows.json → the
  // structural pin REDs AND the baked happy-path run crashes MODULE_NOT_FOUND → RED.
  {
    if (!fs.existsSync(path.join(goldenRoot, 'scripts', 'lib', 'hook-chmod.cjs'))) {
      findings.push(
        'hook-chmod leg — the baked project does NOT carry scripts/lib/hook-chmod.cjs (the KF-55 ' +
        'confinement helper has no rows.json row); its install-hooks/kit-update would chmod ' +
        'unconfined (or crash on require) exactly where the fix is needed most.'
      );
    }
    if (process.platform === 'win32') {
      process.stdout.write(
        'note  hook-chmod leg: behavioral symlink-refusal SKIPPED on win32 (no POSIX symlink/exec-bit ' +
        'semantics) — Linux CI (bake-and-test.yml) carries this leg; the structural row pin above still ran.\n'
      );
    } else {
      const ghDir = path.join(goldenRoot, '.githooks');
      fs.mkdirSync(ghDir, { recursive: true });
      const extRoot = sandbox.sandboxRoot('kit-bake-hookchmod-ext-');
      process.on('exit', () => { if (keep) return; try { fs.rmSync(extRoot, { recursive: true, force: true }); } catch (_) { /* best effort */ } });
      const mkVictim = (name) => {
        const p = path.join(extRoot, name);
        fs.writeFileSync(p, '#!/bin/sh\nexit 0\n');
        fs.chmodSync(p, 0o644);
        return p;
      };
      const mode = (p) => fs.statSync(p).mode & 0o7777;
      // install-hooks needs a real repo for `git config` — terminal-leg mutation, stated above.
      spawnSync('git', ['init', '-q'], { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });

      // (a) BAKED install-hooks: refuse the planted external symlink, target byte-unchanged.
      const victimA = mkVictim('victim-install.sh');
      fs.rmSync(path.join(ghDir, 'pre-commit'), { force: true });
      fs.symlinkSync(victimA, path.join(ghDir, 'pre-commit'));
      const ih = spawnSync('node', [path.join(goldenRoot, 'scripts', 'install-hooks.cjs')],
        { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });
      const ihOut = String(ih.stdout || '') + String(ih.stderr || '');
      if (!(ih.status !== 0 && /refus/i.test(ihOut) && /symlink/i.test(ihOut) && mode(victimA) === 0o644)) {
        findings.push(
          `hook-chmod leg — the BAKED scripts/install-hooks.cjs did NOT refuse a planted external ` +
          `.githooks/pre-commit symlink (exit ${ih.status}, refusal-line ${/refus/i.test(ihOut) && /symlink/i.test(ihOut)}, ` +
          `external target mode 0o${mode(victimA).toString(8)}, expected 0o644 unchanged). The generated copy ` +
          `must carry the KF-55 confinement, not just the workshop bytes.`
        );
      }
      // (b) BAKED install-hooks happy path: clean managed hook → exit 0 (this run is the
      // row-drop mutation detector — a missing helper crashes require → non-zero here).
      fs.rmSync(path.join(ghDir, 'pre-commit'), { force: true });
      fs.copyFileSync(path.join(KIT_ROOT, 'templates', 'dot-githooks', 'pre-commit'), path.join(ghDir, 'pre-commit'));
      fs.chmodSync(path.join(ghDir, 'pre-commit'), 0o644);
      const ih2 = spawnSync('node', [path.join(goldenRoot, 'scripts', 'install-hooks.cjs')],
        { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });
      if (!(ih2.status === 0 && (mode(path.join(ghDir, 'pre-commit')) & 0o111) !== 0)) {
        findings.push(
          `hook-chmod leg — the BAKED scripts/install-hooks.cjs happy path failed (exit ${ih2.status}, ` +
          `pre-commit mode 0o${mode(path.join(ghDir, 'pre-commit')).toString(8)}): a clean managed hook must be ` +
          `repaired and the run exit 0. (A MODULE_NOT_FOUND here = the helper row was dropped — the fix did not travel.)`
        );
      }
      // (c) BAKED kit-update --adopt (--kit → the workshop tree as the template source):
      // the planted pre-push symlink must be refused, non-zero, target byte-unchanged.
      const victimB = mkVictim('victim-adopt.sh');
      fs.rmSync(path.join(ghDir, 'pre-push'), { force: true });
      fs.symlinkSync(victimB, path.join(ghDir, 'pre-push'));
      fs.copyFileSync(path.join(KIT_ROOT, 'release-manifest.json'), path.join(goldenRoot, 'release-manifest.json'));
      const ku = spawnSync('node', [path.join(goldenRoot, 'scripts', 'kit-update.cjs'), '--adopt', '--kit', KIT_ROOT],
        { cwd: goldenRoot, encoding: 'utf8', env: sandbox.scrubGitEnv() });
      const kuOut = String(ku.stdout || '') + String(ku.stderr || '');
      if (!(ku.status !== 0 && /refus/i.test(kuOut) && /symlink/i.test(kuOut) && mode(victimB) === 0o644)) {
        findings.push(
          `hook-chmod leg — the BAKED scripts/kit-update.cjs --adopt did NOT refuse a planted external ` +
          `.githooks/pre-push symlink (exit ${ku.status}, refusal-line ${/refus/i.test(kuOut) && /symlink/i.test(kuOut)}, ` +
          `external target mode 0o${mode(victimB).toString(8)}, expected 0o644 unchanged). Adoption must never ` +
          `exercise chmod authority outside the project — in the generated copy too.`
        );
      }
    }
  }
} catch (e) {
  findings.push(
    `golden leg — could not render/exercise the Standard red-gate: ${e && e.message ? e.message : e}. ` +
    `The golden bootstrap must render a Standard project whose red-gate is wired AND fires.`
  );
}

// ---- report ----
if (findings.length === 0) {
  process.stdout.write(
    `ok    bake: ${GATES.length}/${GATES.length} static gates FIRED in the baked project; ` +
    `stack-aware G9 blocks a planted .py and the .rb visible-skip disclosure inherits; ` +
    `the inline rework-fence skip inherits; ` +
    `the G16 fixture isolates the missing-review check; ` +
    `the golden leg proves the rendered red-gate is wired AND BLOCKS a pre-approval edit ` +
    `(block → approve-red → allow → clear → re-block); ` +
    `the baked project's own mini-smoke runs green AND goes RED on a broken hook; ` +
    `the receipts leg proves the baked pipeline end-to-end — synthesized adapter payloads feed the EVENT ` +
    `sections and the bounded fixture-history synthesizer feeds the COLLECTOR sections — with --check green ` +
    `and a deleted Stop registration going RED as a named coverage gap (--receipts-no-stop); ` +
    `${shippedToProject.length} validators (all ${shipped.length} kit .cjs minus the ${kitOnly.length} kit-only: ${kitOnly.join(', ')}) + hooks + calibration set present.\n` +
    `      (honest scope: the deterministic SCAFFOLD inherits — not the conversational interview; ` +
    `G10 assembled-execution is proven by presence + CI-wiring, not bake-fired.)\n`
  );
  process.exit(0);
}
process.stderr.write('INHERITANCE FAILURE — the baked project does not inherit the gates as claimed:\n');
for (const x of findings) process.stderr.write(`  - ${x}\n`);
process.stderr.write(
  `\n${findings.length} inheritance finding(s). A generated project must carry the gates AND ` +
  `have them FIRE; a missing or present-but-dead validator is not inheritance.\n`
);
process.exit(1);

} // end: if (require.main === module)

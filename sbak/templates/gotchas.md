# {{PROJECT_NAME}} — Gotchas

> Numbered list of project-specific traps that have bitten before. Read at the start of every session. Add to it when a stage surfaces a new gotcha worth carrying forward.

---

## How this list works

- **Per-stage gotchas** live in the active Phase doc's stage section under the `<gotchas>` tag in the CLI prompt. Those are the immediate, scope-local traps for one stage.
- **This file** holds the **graduated** gotchas — ones that emerged from per-stage gotchas at closeout (per `<gotchas_graduation>` in `sbak/BUILD-PLAYBOOK.md` §3.4) and apply to multiple future stages.
- **Disposition values for per-stage gotchas at closeout** (per `sbak/STAGE-PROMPT-PROTOCOL.md` §8):
  - **kept** — still applies; carry into next milestone's stage
  - **graduated** — applies broadly; lands here in `docs/gotchas.md`
  - **resolved** — fixed in code; cite the commit that resolved it
  - **expired** — stage-local trap with no forward applicability; rationale required

When a gotcha is graduated to this file, add a numbered entry with: the trap, the symptom (how it shows up), the cause, the workaround, and a citation to the milestone/stage where it surfaced.

---

## Gotchas

### 1. `startsWith(root)` without a separator is a path-traversal hole (zip-slip prefix bug)

> Framework-shipped (G12). Universal — applies to every project that touches an untrusted path. Do not delete.

**Symptom:** a confinement check that "looks right" lets an untrusted path escape its root. Root `/base`; the candidate resolves to `/base-evil/payload`; `resolved.startsWith("/base")` returns **true** → the write lands *outside* the intended subtree. Same class: archive extraction (`zip-slip`), import/restore of attacker-controlled paths.

**Cause:** a **bare prefix check** (`startsWith(root)`) treats `/base-evil` as inside `/base` because `"/base-evil".startsWith("/base")` is true — there is no directory **separator boundary**. Also bites: comparing **before** canonicalization (a `../` traversal or a symlink slips through), and decoding nothing (`..%2f` survives a raw check).

**Workaround:** the **canonicalize-then-confine** primitive (`style.md` → *Destructive operations & untrusted paths*): resolve **both** root and candidate to canonical absolute form with `realpath` (symlinks resolved, `..` collapsed, encoded sequences decoded) **first**, then confine with the separator boundary — `resolved === root || resolved.startsWith(root + path.sep)`, **never** a bare `startsWith(root)`. Ship **two** tests — rollback **and** a confinement test driving a **real** escaping path (`../../etc/passwd`). `validators/validate-destructive-op.cjs` (G12) blocks a destructive surface that omits either.

**Origin:** the unconfined-restore class; CVE-2025-62156 (Argo zip-slip) is the live fix class.

---

### 2. A mutation-kill that restores via `git checkout` wipes the stage's own uncommitted work

> Framework-shipped (verification discipline — the G9 mutation-kill). Universal to anyone proving a test has teeth mid-stage. Do not delete.

**Symptom:** you mutate a validator to confirm a test goes RED, then "undo" the mutation with `git checkout -- <file>` — and lose the stage's *other* uncommitted edits to that file (or a sibling restored in the same sweep). The mutation-kill passes, but real work silently vanished; caught only on re-verify.

**Cause:** `git checkout -- <file>` restores to **HEAD**, not to your pre-mutation working copy. If the file (or the stage) carried uncommitted changes, those live in your working copy, not in HEAD — so the restore reverts them too.

**Workaround:** back up the working copy before the mutation and restore **from the backup**, not from git — `cp <file> <file>.bak` → mutate → run the test → `cp <file>.bak <file>`. Confirm `git diff --quiet <file>` after restoring. (Post-commit a `git checkout` restore is safe, because the working state *is* HEAD; the trap is only mid-stage with uncommitted changes — which is exactly when most mutation-kills run.)

**Origin:** M11.C retrospective (the `_high_risk_approval` note was wiped by a `git checkout` restore during the G1 mutation-kill).

---

### 3. Two live sessions in one working directory — a concurrent checkout swap lands your commit on the wrong branch

> Framework-shipped (session-topology discipline — A-06). Universal to anyone running an orchestrator + build (or two builds) at once. Do not delete.

**Symptom:** you commit from a build session and the commit lands on a *different* branch than the one you were working on — or a `git status` shows files you never touched. Worst case: a second session switched the checkout under you mid-stage, and your work is now interleaved with another branch's state.

**Cause:** two live agent/CLI sessions sharing **one working directory**. A checkout (`git switch`/`checkout`) in one session moves the shared working tree under the other; both sessions then see and commit against whatever branch was switched to last. This is a recovered real incident, not hypothetical.

**Workaround:** **one working tree per live session.** Give each concurrent session its own `git worktree` (shared `.git`, isolated checkouts): `git worktree add ../build-wt <milestone-branch>`, run the build session there and the orchestrator in the primary checkout. **Before every commit, run `git branch --show-current`** to confirm the branch. Run the full suite from the primary checkout context (linked-worktree test-harness quirks aside). Never point two live sessions at the same directory.

**Origin:** A-06 (a shared-working-tree race during a kit-hardening stage; recovered with zero loss, then adopted as standing discipline).

---

### 4. Type-level assertions pass vacuously when no type-checker sees the test files

> Framework-shipped (test honesty — the G9 family). Applies to every TS project whose tests assert types (`expectTypeOf`, `assertType`, `// @ts-expect-error`). Do not delete.

**Symptom:** a test file full of `expectTypeOf(...)` assertions runs green under the test runner — and stays green after you break the very types it asserts. In the other direction, the IDE flags type errors in `tests/` that no gate ever fails on.

**Cause:** type-level assertions are erased at runtime; only a **type-checker** can fail them, and the checker only checks files a `tsconfig` includes. A `tests/` tree outside every `tsconfig` is invisible in **both** directions: the runner executes the erased no-ops, and `tsc` never opens the files. Green means "the checker didn't look", not "the types hold".

**Workaround:** give the type assertions a checker that **sees the test files** — either the runner's own type-check mode (`vitest --typecheck`, which routes `*.test-d.ts` through `tsc`) or a dedicated `tests/tsconfig.json` included in the gate's `tsc --noEmit` sweep. Then prove teeth once: break an asserted type and watch the gate go red (the standard mutation-kill).

**Origin:** M29.C (V104 item j — the M01 field build shipped `expectTypeOf` tests no checker ever read).

---

### 5. {{GOTCHA_TITLE_1}}

**Symptom:** {{HOW_THIS_SHOWS_UP_TO_THE_DEVELOPER}}

**Cause:** {{ROOT_CAUSE_OR_NA}}

**Workaround:** {{WHAT_TO_DO_INSTEAD_OR_HOW_TO_AVOID}}

**Origin:** {{MILESTONE_AND_STAGE_WHERE_IT_SURFACED_OR_NA}}

---

<!--
Add new graduated gotchas as numbered entries below. Format:

### N. <Title>

**Symptom:** ...
**Cause:** ...
**Workaround:** ...
**Origin:** M0X.Y (link to retrospective if useful)

Do not delete entries. If a gotcha becomes obsolete (the underlying cause is gone), mark it:

### N. <Title> [OBSOLETE — resolved at <commit>]

But keep it in the list — the audit trail value matters more than the visual cleanliness.
-->

---

*This file moves slowly. Most milestones add 0–2 entries. If you're adding 5+ per milestone, the project has deeper structural issues worth surfacing in retrospectives.*

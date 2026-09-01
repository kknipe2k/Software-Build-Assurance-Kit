# Stage loop - operating cheat sheet

> The kit's per-stage operating pattern, in brief. Hand this to anyone about to
> run a build (or read it before your own first stage). This is the loop only;
> the comprehensive worked walkthrough lives in the kit's source repository, not
> in this distribution.

## Setup (once)

- **Builder** = one terminal CLI, per-stage, **fresh on every paste**.
- **Orch** = a separate window/CLI (web or terminal), **long-lived**, never replaced mid-milestone.
- **One working tree per live session.** When Builder and Orch (or two builds) run at once, give each its **own** `git worktree` (shared `.git`, isolated checkouts) - never two live sessions in one working directory. Two sessions sharing one directory can have one switch the checkout mid-work under the other; that is a real incident, not a hypothetical (A-06).
  - **Before every commit, run `git branch --show-current`** to confirm you are on the branch you think you are - the one-line guard against a cross-session checkout swap landing your commit on the wrong branch.
  - Run the suite from the primary checkout context.
- Phase docs live at `docs/build-prompts/M[NN]-<title>.md`.
- **The standard: every human step in the loop is one paste or one line, in the session you're already in - this is the one home for it (A-15).** Anything that needs a second window or a second terminal is a kit defect, not a user failure.
  - The control scripts (`set-mode` / `stage-active` / `approve-red`) are contract-locked to this: no stdin waits, one confirmation line, non-zero + stderr on invalid state.
  - Honest limit: the lock covers the kit's side; a host-level hang (e.g. a shell/CLI stdin-pipe defect) is a host bug to report, not a kit regression - but the kit's scripts can never be the blocking side.
- **`/clear` and exit + restart both re-fire orientation - this is the one home for the `/clear` doctrine.**
  Empirically verified on Claude Code CLI **2.1.201** (2026-07-05, via a SessionStart probe hook that
  logged each firing): `/clear` fires SessionStart with `source=clear`, so the read-first hook re-loads
  and re-prints its stamp - `/clear` does **not** skip orientation on this CLI. Either path gives a clean,
  oriented session. **Exit + restart is the always-works default** (it fires `source=startup`, which every
  CLI version has honored) - prefer it if you are unsure what your CLI's `/clear` does, since the `/clear`
  behavior has varied across versions.

## Roles and commands - the two layers

- **Layer 1 - the role.** `.claude/role` is the canonical session-role state. Set it only with `node scripts/set-mode.cjs <work|verifier|orchestrator|refactor>` (it writes a temp file and atomically renames it, so a hook reading concurrently never sees a half-written file - never use a shell redirect). An absent file means `work`. On session start, the hook reads the role, loads that role's read-first list, and prints the stamp.
- **Layer 2 - the slash commands.** Six ship in `.claude/commands/` and sit on top of the role mechanism: they invoke stages and check you are in the right role, but `set-mode` remains how the role is actually set.
  - `/stage M01 A` - runs a build stage from its Phase doc (requires role `work`; extracts the stage's `X.5 CLI Prompt` and marks the stage open itself).
  - `/verify M01` - runs the Verifier stage (requires role `verifier`, set before the session opens).
  - `/refactor M01` - runs the refactor health check, Stage R (requires role `refactor`, set before the session opens).
  - `/closeout M01` - runs milestone closeout (Stage E).
  - `/approve-red` - **your** action at gate 2: releases the red-gate after you have reviewed the failing tests.
  - `/on-track` - on-demand off-track review against the backlog; sets no role and runs in-session.
  - `/listen <stage>` - orchestrator session only: puts it on the terminal channel for a stage (the builder's packets arrive on their own from then on).
  - `/send [--approval]` - orchestrator session only: **your** keystroke carries the block just surfaced to the builder over the channel; `--approval` marks the RED verdict, which the builder's pickup surfaces and waits on until `/approve-red`.
- Hand-pasting a stage's `X.5` XML block into a fresh session still works - the commands are courier relief on top of the same mechanism, not a replacement for it.

## Per stage (M01.A, then B, ...)

1. Open a **fresh** Builder session and run `/stage M01 A`. It opens the Phase doc, extracts the stage's `X.5 CLI Prompt`, and marks the stage open (`.claude/stage-active`), which arms the PROC-001 red-gate un-approved. Hand-pasting the `X.5` block is the equivalent manual path.
2. **First response should echo the stamp: `[read-first stamp] role=work, op=..., loaded N files, M bytes, N skipped`.** If it doesn't, the agent skipped orientation - exit and restart.
3. **Gate 1 - plan.** Builder surfaces deliverable + test plan. Approve, OR paste it to Orch, then paste Orch's reply back to Builder.
4. **Gate 2 - red.** Builder writes failing tests, surfaces them, and stops. The red-gate hook blocks implementation edits until `/approve-red` writes the approval marker - the marker is the unlock, never approval wording alone. **The release rides the packet (M22 ruling 5):** in the two-brain flow, the Orch verdict packet ends with the explicit line `RED-RELEASE: approved — builder, run node scripts/approve-red.cjs`, and the Builder acts **only on that line** (the command's ask prompt is your release click). Approval language without the line **is not a release** - the Builder stops and tells you `/approve-red` is required.
5. **Gate 3 - stage-end.** Builder implements until tests and validators are green, then surfaces gates + retro + draft commit. Approve or Orch round-trip; the Builder commits only after your approval. **The stamp is asked-and-transcribed (M22 ruling 4):** at approval the builder asks for your verdict (pass/fail + optional note) and transcribes your reply verbatim into the retro's user-stamp block, marked `transcribed:` - you never hand-edit the retro; the verdict's content stays yours alone.
6. **Commit only - no push between stages.** Push happens at the milestone PR after closeout. Committing closes the stage markers (`node scripts/stage-active.cjs --clear`).
7. **Exit Claude** in the Builder terminal (keep the terminal open).
8. Open a fresh Claude for the next stage and go back to step 1.

## Verifier stage (M01.V) - fresh-context bias guard, load-bearing

9. In the Builder terminal, **before** opening Claude: `node scripts/set-mode.cjs verifier` (the mode-guard hook requires this; the verifier read-first list omits prior retrospectives).
10. Open fresh Claude and run **`/verify M01`**.
11. Run gates 1-3 as normal. Surface any finding to Orch.
12. **A 🔴 opens D.fix** (a scoped re-stage authored by Orch; **max 2 iterations**) **before closeout.** 🟡 carries forward; 🟢 logs to `docs/tech-debt.md`.
13. On a clean V, commit. Exit Claude.
14. **Reset the role: `node scripts/set-mode.cjs work`** before opening the next Claude.

## Refactorer stage (M[NN].R) - the canonical lifecycle

The one canonical statement of the shipped Stage R design (authority: `BUILD-PLAYBOOK.md` §3.4.5 + hard gate G7 in §4.4; every other document's Refactorer summary traces here).

- **What it is.** A second fresh-context stage parallel to the Verifier, asking "is the code maintainable?" instead of "did the code do what was promised?": duplication overdue for extraction, complexity creep, dead code, dependency drift - assessed against the cumulative codebase, not just this milestone's diff.
- **Trigger - conditional, at milestone boundaries only.** At each milestone boundary, after the Verifier pass, check `refactor_mode`'s trigger: run Stage R when `docs/tech-debt.md` has at least the threshold count OR the milestone interval has elapsed, **whichever comes first** (`trigger_n5`: 5 entries / every 3 milestones; `trigger_n3`: 3 / every 2). It is not mandatory, and it never runs per stage.
- **Who recommends, who approves.** The trigger arithmetic surfaces the recommendation and the orchestrator relays it; the human approves before the stage opens, like every other stage boundary.
- **Entry.** `node scripts/set-mode.cjs refactor`, then a fresh session, then **`/refactor M01`**.
- **Freshest bias guard in the kit.** The `refactor` role loads `read-first-list-refactor.txt`, which omits prior retrospectives AND prior Stage R findings - one step stricter than the Verifier's list. The builder's justifying context stays hidden so the structural assessment is genuinely fresh.
- **Findings only - Stage R changes nothing.** It writes `retrospectives/M[NN].R-findings.md` (template: `templates/REFACTOR-FINDINGS-TEMPLATE.md`) with the mandatory tier-coverage caveat, and appends 🟢 items to `docs/tech-debt.md`. It also fills its own retrospective, like every Full-tier stage.
- **Remediation = D.refactor, structure not behavior.** A 🔴 finding opens a D.refactor build stage scoped to that finding. It may change structure but not accepted behavior, and all tests and validators must stay green.
- **Post-refactor verification.** After D.refactor, the Verifier re-runs first (confirm the refactor broke no contracts), then Stage R re-runs (confirm the structural issue actually closed). Max 2 D.refactor iterations per milestone; the third escalates.
- **Enforcement.** Hard gate G7 verifies Stage R ran with fresh context when the trigger fired, and that no 🔴 structural finding remains unaddressed at the next milestone PR.
- **Receipts.** Refactor sessions are captured like every role (`refactor` is a valid receipts role), so a live Stage R run lands in the build receipt. Honest status: no real recording to date carries one.
- **Lite skips.** `refactor_mode: skip` - the trigger never fires at Lite.
- **Not currently specified (honest opens, recorded rather than invented):** where Stage R sits relative to the closeout narrative stage (the shipped bound is only "after the Verifier, resolved by the next milestone PR"); how a declined run is recorded when the trigger fired but the human said no; and the boundary trigger check is a human/orchestrator step today - no shipped automation runs the arithmetic for you.

## Closeout (M01.E) + IRL check

15. Open fresh Claude and run **`/closeout M01`**, gates as normal.
16. **Read `docs/app-map.md` and run the listed How-to-exercise steps for the surfaces this stage touched** - the map *is* the IRL/drive script. Every `verified` entry is bound to a green test-id (the currency check fails the PR otherwise), so the steps can't have silently drifted from the shipped app. (No app-map - Lite, or `app_map: skip` - falls back to asking Builder for an IRL/UI test.)
17. Orch plans the walkthrough **from the map**; you run it in the running app.
18. **Significant findings (🔴/🟡): do NOT defer to M02.** Ask Orch to author **M01.1** (decimal namespace = remediation milestone, distinct from stages A/B/V/E). Run M01.1.A, then V, then E exactly like a normal milestone. Close all 🔴/🟡 before M02 starts.
19. Closeout approval, then Builder commits + pushes the branch + drafts the PR. Tell Builder to open the PR when you're ready.

## Full vs Lite

- **Full** runs the loop above as written: XML stage prompts, all gates and validators, the Verifier at its full pass set, Stage R per its trigger.
- **Lite** works from the Phase doc's markdown task list (no XML prompts), runs the Verifier at its reduced inventory pass, and skips Stage R (`refactor_mode: skip`). The three human gates - plan, red, stage-end - hold at both tiers.

## If a session dies mid-stage (recovery)

- Exit and reopen a fresh session, then run the same `/stage` again: it re-marks the stage open and clears any stale red approval (a fresh stage always starts un-approved), so the gates re-arm instead of trusting leftover state.
- Partial work is still in the working tree; nothing is lost. Gates 1-3 re-run from where the artifacts actually are.
- The `/clear` doctrine in Setup covers the orientation half: `/clear` and exit + restart both re-fire orientation.

## Operating doctrine - five rules that ship with the loop

Each prevented a real recorded failure; each is one line so it travels.

- **The marker is the unlock.** Implementation starts when `/approve-red` writes the marker, never on approval wording alone - a stage once proceeded on language the gate would have refused.
- **Flag, don't absorb.** When a reviewed artifact contains something you would change, surface the flag and wait - silently folding a fix into someone else's text once carried a defect past its reviewer.
- **No wholesale rewrites of human text.** A human-authored draft is adopted as the base and changed one surfaced diff at a time - a fold-in merge once left the human unable to audit their own document.
- **Read the ledger before the stage.** Open the debt and findings ledgers before gate 1, not at closeout - a stage once shipped a claim its own ledger already contradicted.
- **Clean claims bind to final staged bytes.** "Validation green" means the exact bytes being committed are the bytes that were validated - a green run followed by one more edit is not a green run.

## Orch session handoff - before context fills or you shut Orch down

Builder state is durable: git log, retrospectives, Phase docs, and the append-only ledgers recover it completely. The orchestrator's working synthesis is not - routing decisions, in-flight adjudications, and the half-resolved fix cycle live only in that session's head. The handoff is the only bridge; author it before you need it, never after.

Two artifacts, together:

- **Durable state: `ORCHESTRATOR.md` §10 "Current state".** The orchestrator updates it in the working tree at every state-changing turn (a verdict, a ruling, a stage boundary), with a final rewrite before the session closes. It survives a crash because the next session's hook reads live bytes, not git history.
- **The handoff prompt, pasted as the new session's first message.** Ask the outgoing Orch to write it, covering: milestone + exact stage position; last completed stage + commit; the single next action; in-flight decisions awaiting your call; latest Verifier findings + D.fix status; open prior-milestone carry-forwards; the latest `git log --oneline main..HEAD` the Builder surfaced; and decisions locked this session so they are not re-litigated.

The incoming Orch reads `ORCHESTRATOR.md` first (its read-first list starts there), reads the pasted prompt, and echoes its understanding back to you **before acting**, so you can correct any drift before it routes anything.

## Next milestone

20. Ask Orch to author **M02** (or M01.1 first if remediation is open).
21. Repeat the per-stage loop through V, E, IRL, fix-cycle if needed. Done when the last milestone in `docs/scope.md` ships.

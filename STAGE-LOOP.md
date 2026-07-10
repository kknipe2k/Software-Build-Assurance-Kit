# Stage loop — operating cheat sheet

> The kit's per-stage operating pattern, in brief. Hand this to anyone about to
> run a build (or read it before your own first stage). Comprehensive walkthrough:
> `WALKTHROUGH.md`. This is the loop only.

## Setup (once)

- **Builder** = one terminal CLI, per-stage, **fresh on every paste**.
- **Orch** = a separate window/CLI (web or terminal), **long-lived**, never replaced mid-milestone.
- **One working tree per live session.** When Builder and Orch (or two builds) run at once, give each its **own** `git worktree` (shared `.git`, isolated checkouts) — never two live sessions in one working directory. Two sessions sharing one directory can have one switch the checkout mid-work under the other; that is a real incident, not a hypothetical (A-06). **Before every commit, run `git branch --show-current`** to confirm you are on the branch you think you are — the one-line guard against a cross-session checkout swap landing your commit on the wrong branch. Run the suite from the primary checkout context.
- Phase docs live at `docs/build-prompts/M[NN]-<title>.md`.
- **The standard: every human step in the loop is one paste or one line, in the session you're already in — this is the one home for it (A-15).** Anything that needs a second window or a second terminal is a kit defect, not a user failure. The control scripts (`set-mode` / `stage-active` / `approve-red`) are contract-locked to this: no stdin waits, one confirmation line, non-zero + stderr on invalid state. Honest limit: the lock covers the kit's side; a host-level hang (e.g. a shell/CLI stdin-pipe defect) is a host bug to report, not a kit regression — but the kit's scripts can never be the blocking side.
- **`/clear` and exit + restart both re-fire orientation — this is the one home for the `/clear` doctrine.**
  Empirically verified on Claude Code CLI **2.1.201** (2026-07-05, via a SessionStart probe hook that
  logged each firing): `/clear` fires SessionStart with `source=clear`, so the read-first hook re-loads
  and re-prints its stamp — `/clear` does **not** skip orientation on this CLI. Either path gives a clean,
  oriented session. **Exit + restart is the always-works default** (it fires `source=startup`, which every
  CLI version has honored) — prefer it if you are unsure what your CLI's `/clear` does, since the `/clear`
  behavior has varied across versions.

## Per stage (M01.A, then B, …)

1. Copy the stage's `X.5 CLI Prompt` from the phase doc → paste into a **fresh** Builder.
2. **First response should echo `[read-first stamp] mode=work files=N`.** If it doesn't, the agent skipped orientation — exit and restart.
3. **Gate 1 — plan.** Builder surfaces deliverable + test plan. Approve, OR paste it to Orch → paste Orch's reply back to Builder.
4. **Gate 2 — red.** Builder writes failing tests, surfaces them. Approve or Orch round-trip.
5. **Gate 3 — stage-end.** Builder implements to green, surfaces gates + retro + draft commit. Approve or Orch round-trip.
6. **Commit only — no push between stages.** Push happens at the milestone PR after closeout.
7. **Exit Claude** in the Builder terminal (keep the terminal open).
8. Open a fresh Claude → next stage's `X.5` → back to step 1.

## Verifier stage (M01.V) — fresh-context bias guard, load-bearing

9. In the Builder terminal, **before** opening Claude: `node scripts/set-mode.cjs verifier` (the mode-guard hook requires this).
10. Open fresh Claude → paste **M01.V**.
11. Run gates 1–3 as normal. Surface any finding to Orch.
12. **🔴 → D.fix** (a scoped re-stage authored by Orch; **max 2 iterations**) **before closeout.** 🟡 carries forward; 🟢 logs to `docs/tech-debt.md`.
13. On a clean V, commit. Exit Claude.
14. **Reset mode: `node scripts/set-mode.cjs work`** before opening the next Claude.

## Closeout (M01.E) + IRL check

15. Open fresh Claude → paste **M01.E** → run gates as normal.
16. **Read `docs/app-map.md` and run the listed How-to-exercise steps for the surfaces this stage touched** — the map *is* the IRL/drive script. Every `verified` entry is bound to a green test-id (the currency check fails the PR otherwise), so the steps can't have silently drifted from the shipped app. (No app-map — Lite, or `app_map: skip` — falls back to asking Builder for an IRL/UI test.)
17. Orch plans the walkthrough **from the map** → you run it in the running app.
18. **Significant findings (🔴/🟡): do NOT defer to M02.** Ask Orch to author **M01.1** (decimal namespace = remediation milestone, distinct from stages A/B/V/E). Run M01.1.A → V → E exactly like a normal milestone. Close all 🔴/🟡 before M02 starts.
19. Closeout approval → Builder commits + pushes the branch + drafts the PR. Tell Builder to open the PR when you're ready.

## Next milestone

20. Ask Orch to author **M02** (or M01.1 first if remediation is open).
21. Repeat the per-stage loop through V, E, IRL, fix-cycle if needed. Done when the last milestone in `docs/scope.md` ships.

---

## Orch session handoff — before context fills or you shut Orch down

> **Authority: `ORCH-HANDOFF.md`** — the full swap-out process (the two layers, the outgoing checklist, the incoming bootstrap, the prompt template). The quick version below defers to it.

Orch is long-lived but not infinite. Before its context fills, before a compact,
or before you close the Orch session, **ask current Orch**:

> *Write a detailed handoff prompt for the next Orch session — current milestone
> + stage, in-flight decisions awaiting my call, latest Verifier findings + D.fix
> status, prior-milestone carry-forwards still open, the latest `git log --oneline
> main..HEAD` Builder surfaced, and where we are in the M0N.x sequence.*

Paste that prompt as the **first message** of the new Orch session. New Orch reads
it, echoes its understanding, picks up.

**Why this matters.** Builder state is durable — git log + retros + phase docs
recover it. Orch's working synthesis is **not** — it lives only in its head. The
handoff prompt is the only bridge. Skip it and the next Orch session starts blind:
re-derives every routing decision, asks you questions whose answers you already
gave, and the cluster-gate / fix-cycle context goes back to zero. Author the
handoff *before* you need it; never after.

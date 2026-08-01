# Calibration Interview — the first thing the bootstrap asks

> **Read this verbatim or paraphrase very lightly.** Surfacing the trade-offs explicitly is the whole point — the user shouldn't have to read `sbak/FRAMEWORK-CONFIG.md` to make an informed choice. This file is the canonical text the bootstrap agent presents at the start of a fresh starter-kit session, so the calibration is the same every time.
>
> **The interview is 3 asks + 1 confirmation turn** (M26.D — the ratified simplification; the retired 5-choice shape is history). The asks and every derived value are machine-defined in `calibration-core.json`; the agent computes the derivations with `node scripts/calibration-derive.cjs --answers <answers.json> --json` and renders the confirmation turn from its output. The mapping table at the bottom of this file is for the agent, not the user.

---

## What the agent says first (verbatim)

> "I see the Software Build Assurance Kit. Before I start anything: three quick questions — **what kind of work is this**, **how much assurance does it need**, and **does it touch any risky surfaces**. Everything else (deliverable type, where tests run, review cadence) I'll derive from your description and confirm back to you in plain English before anything is generated.
>
> If you don't want to choose: I'll default to **greenfield + Full** — the assurance default; you can re-tier to Lite (or back) any time from `project-config.md`."

**Presentation pacing + menu discipline.** Ask **one question per turn** — mode first, then tier, then risk — and WAIT for the answer before presenting the next; never batch the interview into one wall of tables. Lead each ask with **numbered recommendations** inferred from the repo and the user's description, so the user can answer **accept-by-number** or override in their own words. Numbered options draw ONLY from the documented dials in this file — **never offer to disable a named control** (a hook, a validator, a gate, the fence); skips are user-initiated only and carry their stated cost, restated in one line before the skip is honored.

---

## Ask 1 — Operating mode: what kind of work is this?

The **leading question**. It sets `operating_mode` — the *kind* of work — which is orthogonal to tier (the *amount* of ceremony). The mode determines which discovery questions follow, which scaffold generates, and the top-level shape of the work. All four modes are live.

| Option | Status | Means | What it does |
|---|---|---|---|
| **Greenfield** (default) | **Live** | Build something new from scratch. | Milestones-of-stages, the full bootstrap. The framework's best-supported path. |
| **Bug fix** | **Live** | Fix a known defect in existing code. | A reduced 3-phase shape — reproducer + impact analysis → minimal scope-locked fix → single Verifier pass. Different discovery, no spec/scope/milestones, a CHANGELOG one-liner instead of closeout. **Not a small build** — different discovery, deliverable, and rhythm. |
| **Research / publish** | **Live** | Synthesize literature or data into a paper + interactive illustrative app. | A hybrid two-phase shape — **Phase R** (grounded-STORM research, always Lite *process*, mandatory sources registry) → an **explicit user re-tier** → **Phase A** (the interactive app at the tier it warrants, inheriting Stage V). Research is light, the app is engineered. |
| **Audit** | **Live** | Review an existing codebase for security / performance / architecture / compliance. | Inventory → triage → per-dimension passes (per-file sign-off) → fresh-context challenge → consolidation. The deliverable is a findings report + remediation backlog, **not new code**; no milestones and no Stage V (audit *is* verification). The tier sets the dimension count (Lite 1–2 / Full up to all 8). |

> **Beta modes:** `bug_fix`, `research_publish`, and `audit` are beta - they run end to end today, but with limited scaffold generation: the row schema cannot yet render mode-specific artifacts (the MVP3 row-schema extension closes this), so their scaffolds lean on the shared set until that lands. The default path is unaffected.

> Verbatim ask: *"What kind of work is this? **Greenfield** (build something new), **bug fix** (fix a known bug in existing code), **research/publish** (synthesize literature into a paper + interactive app), or **audit** (review an existing codebase)? If you're not sure, pick greenfield — it's the best-supported path."*

**Maps to:** `operating_mode` in `project-config.md` (`greenfield` / `bug_fix` / `audit` / `research_publish`). Default `greenfield`. A pre-commit value check (`validators/validate-operating-mode.cjs`) rejects any value outside the four. The mode is **project-scoped** and orthogonal to the session-scoped 3-brain `role`. The mode determines which discovery questions follow: `bug_fix` asks its three questions (reproducer / affected surface / blast radius); `research_publish` discovers a **research question** + explicit scope (not a software spec — the paper's one question, in and out of scope); `audit` scopes dimensions + depth. The full replacements live in `OPERATING-MODES.md` §4–§7 and the `bootstrap/MODE-*.md` playbooks — the bootstrap reads exactly one after this answer.

---

## Ask 2 — Tier: how much assurance does this project need?

Two tiers. **Full is the default** — the kit's value lives in its verification machinery, and structure pays as the stakes rise. **Lite is the honest low-ceremony escape hatch**, not a lighter build of the same machinery.

| Option | When it fits | What you get | What you give up |
|---|---|---|---|
| **Full** (default) | Anything with a second reader, an audit need, or a multi-week horizon. Small services, libraries you'll maintain, regulated or long-lived systems. | ~108 scaffold files. Staged work + Stage E closeout. Two-axis retrospectives (process + product). XML stage prompts. The fresh-context Verifier. Blocking framework validators. Append-only ledgers (CI-enforced when a risk trigger is declared). | Lighter ceremony. Faster iteration on throwaway work. |
| **Lite** | A few hours to ~1 week, solo, no audit need. CLI tool, prototype, weekend script. | ~44 scaffold files. Plain markdown task lists, no XML stage prompts. Brief retrospectives. Advisory validators. CHANGELOG-only ledger. | The gates, the fresh-context Verifier, and the append-only audit trail — i.e., *most of why you'd pick this kit*. |

> Verbatim ask: *"How much assurance does this need? **Full** (the default — staged work, verification gates, audit trail) or **Lite** (low-ceremony: task lists, brief retros, advisory checks)? If the project is solo, has no audit need, and fits in ~2 weeks, Lite is the honest choice — say so and I'll set it up with eyes open."*

**The trade-off, cited both ways.** Structure is not free: on a small or throwaway task the ceremony can dominate the work (Scott Logic clocked a spec-driven rebuild at ~10× slower with no quality gain — https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html). And structure pays as stakes rise — verification, not generation, is the bottleneck (DORA 2025: AI amplifies existing discipline; small batches + strong version control are the named amplifiers — https://dora.dev/dora-report-2025/). That is why the default is Full and the escape hatch is honest.

**Downshift rule (bias toward less ceremony).** Over-tiered is as broken as under-tiered — process drowning the work fails just as hard, only quietly. If the project is **solo + no audit need + ≤2 weeks**, recommend **Lite regardless of how complex the stack feels**: the complexity lives in the code, not the coordination. Only stay at Full when there's a real second reader, an audit/compliance need, or a multi-week horizon.

**Maps to:** `tier` in `project-config.md` — `Full` or `Lite` (the enforced spellings; the third tier was retired at M26.D, merged into Full). The per-tier toggle defaults live in `calibration-core.json` and are surfaced in the confirmation turn.

> **Scaffold-count note.** The per-tier counts above — and everywhere they appear (`README.md`, `sbak/QUICKSTART.md`, `WHY-THIS-KIT.md`) — are **derived**: the number of files rendered at the tier's *reference calibration* (greenfield · hybrid verification · non-web · no declared risk), computed by `scripts/golden-bootstrap.cjs` and published in `sbak/golden-manifest.json`. A real project varies with its answers; these are the reference figures, not a promise. Don't hand-edit them — regenerate the manifest (`node scripts/golden-bootstrap.cjs --write-manifest`) and read the new counts (the schema→prose parity check fails a hand-drifted count). **Distribution seam:** the manifest computes these reference figures over the kit's full source tree; a project bootstrapped from the shipped distribution renders the subset whose templates ship - 41 at Lite / 97 at Full - which is the pair the distribution's own `README.md` tier table carries.

---

## Ask 3 — Risk triggers: does the project touch any of these surfaces?

Asked of every project, both tiers — because **risk overrides tier**. Tier sets *how much* ceremony by default; a declared risk surface raises verification depth **above** that floor regardless of tier, and at Full it **arms CI enforcement of the append-only ledgers** (`.github/workflows/append-only-ledger.yml` generates only when a trigger is declared).

| Risk trigger | Touches it if the project… |
|---|---|
| **destructive data ops** (`destructive_data_ops`) | replaces / imports / restores / migrates / deletes user data |
| **archives / backup-restore / extraction** (`archive_extraction`) | unzips / untars / extracts archives or restores backups (zip-slip surface) |
| **filesystem writes from untrusted metadata** (`untrusted_fs_writes`) | writes to a path/filename derived from input or file metadata |
| **credentials / provider config** (`credentials`) | handles secrets, tokens, API keys, or provider configuration |
| **generated / untrusted HTML or executable content** (`untrusted_html`) | renders generated HTML, evals code, or runs generated executables |
| **installers / updaters / release artifacts** (`installers`) | ships an installer, auto-updates, or produces signed/release binaries |

> Verbatim ask: *"Does the project touch any of these: destructive data operations, archive extraction, filesystem writes from untrusted input, credentials, generated/untrusted executable content, or installers/release artifacts? 'None' is fine and common — the point of asking is that a high-risk surface is never left at the tier floor by omission."*

**Maps to:** `risk_triggers:` in `project-config.md` (a list of the declared tokens, or `[]`). Each declared trigger **must** carry a visible escalation record in `docs/gates.md` (the canonical token `deep verification because:` bound to the trigger) — enforced by `validators/validate-risk-escalation.cjs` (G11). At **Full**, any declared trigger also arms the ledger workflow (see `calibration-core.json` `risk_armed_modules`); at **Lite** the trigger is recorded and G11 escalation applies, and the confirmation turn says so explicitly — a derived value never silently no-ops. The agent can *propose* triggers from the project description (a "restore from backup" feature → `destructive_data_ops` + `archive_extraction`) and confirm.

---

## The confirmation turn — every derived value, in plain English, before anything happens

After the three asks, the agent runs the deriver and confirms the whole calibration back — **every derived value with a one-line why — and invites correction**. Nothing is locked until the user nods; nothing beyond these three answers is ever asked as a quiz.

Derived (not asked) values, each rendered from `calibration-derive` output:

- **Deliverable type** — proposed from the project description (`cli` / `web` / `library` / `service` / `other`). Web/UI turns on the design brief + browser-load verification; a library gets the API-surface contract. Correct the inference if wrong.
- **Verification locus** — derived from repo visibility and ship targets, never from tier: public repo → **cloud** (Actions free + unlimited); private → **local-first (hybrid)** (near-zero Actions spend). The **Docker leg runs only when a ship target is linux/server-class** — a Windows-only CLI or a browser game verifies native-only. `local_first` (no PR backstop) is an explicit user override only.
- **Approval cadence** — the one-line disclosure: reviews at stage boundaries, the fenced-autonomy permission fence, and G1 (nothing committed without approval) at every setting. Say "review more often" or "review less often" to move the dial; the fence follows.
- **Validator severity** — from the tier: Full **blocks** on the 8 framework validators, Lite **warns**. Per-validator override via the warn|block rows in `project-config.md`.
- **The tier's toggle set** — retrospective depth, verifier passes, refactor trigger, ledger posture, app-map — each with its why, from `calibration-core.json`.
- **Scaffold count** — derived from the row registry for this exact calibration; `details` gets the itemized list.

Example (the shape, not a script): *"Got it — greenfield, Full, no declared risk surfaces. Deriving the rest: CLI deliverable (from your description — correct me if this is really a service); tests run local-first since the repo is private, native-only since nothing ships to Linux; reviews at stage boundaries with the fenced-autonomy fence (I never commit without your approval); the 8 framework validators block at Full; two-axis retros, Verifier passes 2+4, ~108 files. Anything to change before discovery?"*

**The permission fence** (rides the cadence disclosure — the same dial as *"how much do you want to babysit?"*): the `.claude/settings.json` wall of `allow` (runs unattended), `ask` (pauses for you), and a hard `deny` floor. Three named profiles follow the cadence: **Maximum oversight** (`default` mode — everything but lint pauses) when you dial reviews up to per-step; **Fenced autonomy** (`acceptEdits` — edits/tests unattended, git + installs pause), the recommended per-stage default; **Sleep-through** (`acceptEdits` + the user-level `auto` opt-in) at per-PR. **The `deny` floor is identical at every setting — the wall doesn't move**: secret reads (`.env`, `.env.*`, `secrets/**`, `*.pem`, `*.key`) and irreversible Bash (`git push --force`, `git reset --hard`, `git clean`, `rm -rf`) are always denied, and `git commit` / `git push` stay `ask` everywhere (G1). The generated `CLAUDE.md` carries the four honest caveats (the user-level `auto` opt-in, why `.claudeignore` is broken, the web-remote constraint, and the workspace trust gate) so the fence isn't trusted past what it guarantees.

---

## How the user can answer

1. **Direct**: "Greenfield, Full, no risk surfaces."
2. **Describe**: "It's a small CLI tool I'll write over a weekend; it restores backups." Agent infers and proposes: *"That's greenfield + Lite (weekend scale, solo) — and 'restores backups' means I'd declare `destructive_data_ops` + `archive_extraction`, which raises verification depth on that surface even at Lite. Confirm or revise?"*
3. **Punt**: "I don't know — pick something reasonable." Agent picks **greenfield + Full + []**, infers the deliverable type from the description, and notes that re-tiering is cheap (`sbak/FRAMEWORK-CONFIG.md` §7).

**Existing repo + one feature?** Still **greenfield** — say so in the description (*"add a CSV export to my existing app"*). The bootstrap takes the existing-repo, single-feature calibration (the brownfield shortcut in Phase 0.2): two brownfield discovery questions, a ONE-milestone plan, and a Stage-A impact-analysis step. The interview + scaffold cost is repo onboarding, paid once.

---

## Smells to flag during the interview

- **Lite + audit/compliance need** — audit needs override time horizon; Lite doesn't generate the audit trail. Re-ask the tier.
- **Full + throwaway prototype** — over-tiered is real: if it's solo, ≤2 weeks, no second reader, apply the downshift rule and recommend Lite plainly.
- **Public repo + a local-first override** — you'd maintain a local harness to save Actions minutes that are already free + unlimited on public repos. Unless you specifically want fast local pre-push feedback, cloud is simpler.
- **`bug_fix` + multi-week horizon** — a multi-week "fix" is a refactor/feature project (`greenfield`) or a sign the surface needs an `audit` first. Re-ask the mode.
- **`bug_fix` + "while I'm in here" cleanup** — scope creep destroys the regression-test bound (G_BUGFIX_B1); out-of-scope improvements go to `docs/tech-debt.md` / `CHANGELOG.md`, never into the fix.
- **`audit` + Lite + all 8 dimensions** — a Lite audit is a 1–2-dimension health check; all 8 with challenge reviews is a Full audit. Re-ask the tier.
- **`research_publish` + "skip Stage V"** — can't be honored for the app: Phase A inherits Stage V at whatever tier it re-tiers to (the app is the engineered half). If no Verifier at all is wanted, that's closer to a Lite greenfield demo.

---

## Toggle mapping (for the agent, not the user)

The three answers map directly; everything else derives via `scripts/calibration-derive.cjs` (authority: `calibration-core.json`).

| Answer | Toggle | Value |
|---|---|---|
| Greenfield / Bug fix / Research / Audit | `operating_mode` | `greenfield` / `bug_fix` / `research_publish` / `audit` |
| Full / Lite | `tier` | `Full` / `Lite` |
| Declared risk surfaces | `risk_triggers` | the declared tokens, or `[]` |

Derived by the deriver (surfaced in the confirmation turn, recorded in `project-config.md`): `deliverable_type` (proposed from the description), `verification_locus` + the Docker leg (repo visibility + ship targets, KF-28), `approval_cadence: per_stage` + the `fenced_autonomy` fence (the disclosure), the per-tier severity (`warn` at Lite / `block` at Full — the `{{VALIDATOR_SEVERITY_FLAG}}` render), the tier toggle set (`retro_depth`, `ledger`, `read_first_cap`, `red_review`, `off_track_check`, `app_map`, `verifier_mode`, `refactor_mode`), and the standing defaults (`explanation_mode: standard`, `web_verify: always`, `research_mode: best_practice_first`, `pre_write_surface: spec_and_plan_only`, `escalation: time_box_2x`, `hook_enforcement: enforced` — the retired expertise ask's derived toggles, now one documented default set for everyone, each overridable in `project-config.md`).

**Verifier (Stage V):** tier-derived (`verifier_mode`: Lite `pass_1_only` / Full `pass_2_4`), surfaced in the confirmation turn, not asked. If the user asks, point at `sbak/BUILD-PLAYBOOK.md` §3.4 and offer the override (`sbak/FRAMEWORK-CONFIG.md` §4.10).

**Refactor (Stage R):** tier-derived (`refactor_mode`: Lite `skip` / Full `trigger_n5`); override via §4.11.

**Off-track check (G8):** tier-derived (`off_track_check`: Lite `brief` / Full `advisory`); `/on-track` is available at every value (§4.15).

**App-Map:** tier-derived (`app_map`: Lite `skip`; Full `on` for drivable surface classes, `skip` for `library`/`api`) — §4.16.

**Orchestrator/build role split:** structural, from the tier: at **Full** the agent runs as two session types (orchestrator + build sessions, `ORCHESTRATOR.md`); at **Lite** they collapse into one and `ORCHESTRATOR.md` is not generated. Not a question — it falls out of the tier answer.

---

## Re-running the interview later

After bootstrap, this interview is *not* repeated. The active calibration lives in `project-config.md`. To change calibration mid-project: edit `project-config.md` directly, or ask the agent in any session ("I want to re-tier"); it presents the relevant option from this file and confirms before updating the config and appending the override log. The interview is the bootstrap entry point; the override log is the steady-state mechanism.

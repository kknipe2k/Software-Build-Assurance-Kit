# MODE-greenfield.md — the `greenfield` operating-mode playbook (Software Build Assurance Kit bootstrap)

> **Re-homed VERBATIM from the bootstrap `CLAUDE.md` §"Phase 0 Step 0.0" + §"Step 0.2 — Discovery questions" + the leading-dial section.** Read this file when Phase 0 Step 0.0 resolves `operating_mode` to `greenfield` — a session loads exactly ONE mode playbook and leaves the other three unread. The moved text below is byte-for-byte; references to Steps 0.1–0.2, the Phases, and "below"/"above" resolve against the router's workflow in `CLAUDE.md`.

## The Step-0.0 entry

- **`greenfield`** (default) — build something new. Everything below (Steps 0.1–0.2, Phases 1–5) proceeds **unchanged**. This is the path the framework handles best.

## The discovery playbook (Step 0.2)

**Step 0.2 — Discovery questions, depth determined by tier.**

For **Lite** tier (~15 min total):

1. **What is this?** One paragraph.
2. **What isn't this?** What are you deliberately not building?

For **Full** tier (~30 min total):

1. **What is this?** One paragraph.
2. **What isn't this?** Just as important.
3. **Stack.** What languages, frameworks, runtimes? Open to recommendations?
4. **v1 scope.** What's the smallest meaningful release?
5. **Success criteria.** How will you know v1 is done?
6. **Distribution target.** Library / service / desktop / CLI / mobile? Different gates apply.
7. **License + contribution model.** OSS? Proprietary? Solo or team?
8. **Naming.** Project name? Repo dir name?

**Target OS + repo visibility (all tiers).** Gather the two facts that confirm the derived `verification_locus` posture (KF-28: repo visibility + ship target, never tier) and drive the generated workflows: *which OSes does this ship to or run on (in particular — **does it ship to macOS?** check packaging config: electron-builder targets, `pyproject`/`setup` classifiers, build scripts; don't assume), and is the repo public or private?* Public → cloud Actions are free + unlimited, lean `cloud`; private → `hybrid` keeps minutes near-zero (full suite local at pre-push, one ubuntu PR smoke check, macOS + full matrix only on `v*` tags). The macOS-ship answer decides whether `release.yml` (or the cloud `ci.yml` matrix) carries a macOS leg. This is the Phase-0 "audit" step of the local-test-verification flow (`sbak/BUILD-PLAYBOOK.md` §0.6). **Also gather the `LICENSE` holder + year** (and license type — MIT is the scaffold default) — the generated `LICENSE` fills `{{LICENSE_HOLDER}}`/`{{LICENSE_YEAR}}`/`{{LICENSE_TYPE}}` from this answer; **never guess a copyright holder** (hard rule #7). At Full tier this folds into the existing license/contribution question.

**Existing-repo, single-feature calibration (the brownfield shortcut — all tiers).** When the mode is `greenfield`, the directory already contains a working codebase, and the stated scope is a single feature, run discovery in its lean form: the tier's questions above, scoped to the feature (the "what is this" is the feature; the "what isn't this" is the scope fence that keeps it to one milestone), **plus two brownfield questions**: **(a) where does it live** — the file(s)/module(s) the feature extends; **(b) what existing behavior must not change** — the impact question; its answer seeds the Stage-A impact-analysis list (the existing tests that must re-run after the change). Frame the cost honestly: the interview + scaffold are **onboarding the repo, paid once** — after this bootstrap, every subsequent feature skips bootstrap entirely (an orchestrator session authors the next milestone directly; see `sbak/STAGE-LOOP.md` "Next milestone"). There is deliberately no separate "feature" operating mode: a feature has a spec, new code + tests, stages, a verifier, and a closeout — it is the greenfield shape; only the discovery depth and the milestone count shrink.

**Brownfield known-issue harvest (bug_fix + single-feature discovery — UAT #19).** An existing codebase has usually already written down what flakes and what's broken; the ledgers must start from that reality, not from invention. As part of brownfield discovery, run `node scripts/kit-update.cjs --ingest` (also run automatically by `kit-update --adopt`): it harvests the repo's existing known-issue markers — **TD-labeled test titles**, `.skip`/`fixme` annotations, retry configs — into `docs/gotchas.md` / `docs/tech-debt.md` as **imported** entries (imported, never invented; the ledgers are append-only and a re-run never duplicates an entry). Surface what was imported to the user during discovery — a harvested entry is a discovery answer the repo gave for free.

For **all tiers**, web-verify any technical choices (library versions, frameworks, idiomatic patterns) before proposing them — `research_mode: best_practice_first` is the standing default for every project (the expertise ask was retired at M26.D, KF-07). Don't ask the user "which database should we use?"; surface the current best-practice options for their use case with rationale, then ask which appeals.

Surface a one-page summary of the answers + the inferred tier + expertise. User confirms or revises. **Lock tier and expertise to `project-config.md` only after Phase 1.** Don't generate the config file yet — the spec may surface a complexity higher than the initial tier suggested, and the right move is to bump tier before scaffolding.


## The leading-dial summary

- **`greenfield`** (default) — build software from scratch. The full bootstrap workflow above. **Implemented.**

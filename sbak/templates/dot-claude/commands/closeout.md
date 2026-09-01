---
description: Run milestone closeout (Stage E) (e.g. /closeout M01)
argument-hint: <milestone>  — e.g. M01
---

You are a **build session running closeout (Stage E)** for the named milestone. Confirm orientation loaded (`[read-first stamp]`) before starting.

Arguments: `$ARGUMENTS` (the milestone id, e.g. `M01`).

Steps:

1. Read every read-first entry tagged `when: closeout` (if any - the manifest in your stamp names them) and run `node scripts/lib/read-ledger.cjs --check closeout`; it refuses, naming the file, if a required read is not on the ledger. Then open `docs/build-prompts/<milestone>-*.md` and find its closeout section — the `<closeout_stage_prompt>` block — and follow it.
2. Full closeout produces: the milestone summary (`prompts/SUMMARY-TEMPLATE.md`, carrying the milestone's ONE scored self-assessment), an append-only entry in `docs/gap-analysis.md` (never edit prior lines — append-only by Hard Rule; the CI diff check that enforces it is risk-armed, arriving with `append-only-ledger.yml` when a risk trigger is declared; the entry CITES receipts/retro/V-R sources and seeds its numbers — `node validators/validate-closeout-packet.cjs --gap docs/gap-analysis.md` checks the shape), a `CHANGELOG.md` entry, and a draft PR description. Run the three-artifact review under its three hard rules: the review runs **against receipts**, never artifact-vs-artifact; the CHANGELOG entry is **derived from the commit list** (`git log --oneline main..HEAD`) and the authored part is the one why-it-matters line; the closeout packet **leads with deltas-from-plan** and the open V/R findings — validate it before surfacing (`node validators/validate-closeout-packet.cjs --packet <packet-file>`). Update the release-state ladder row for this milestone — `node validators/validate-closeout-packet.cjs --ladder <milestone>` REDs a closeout whose ledger has no row. Append the session-register entry as part of the stage-end checklist; ledger backfills append at end of the file only, never mid-file. Mid-build manifest regeneration (where your project has one) is closeout-only — never a per-push step.
3. **The full floor and the test-estate review.** Run `node scripts/verify-local.cjs --lane release` — the whole suite, every leg; a green `fast` lane is not closeout evidence. Then run `node scripts/verify-local.cjs --reconcile <milestone>`: it proves the union pin in three lines and prints the test-estate review (discovered / settled per milestone / active / always-tagged, numbers from the run, never typed) — paste that section into the closeout packet. Only after the three proofs print, `node scripts/verify-local.cjs --reconcile <milestone> --write` marks the milestone's tests settled in `tests/.settled.json`; commit it with the gap-analysis entry.
4. **v1 boundary check:** surface the explicit choice — continue to the next milestone / ship v1 here and roll the remainder / pause for re-tier. Don't silently default to "continue."
5. Surface the closeout packet and wait — **do not commit, push, or open a PR without approval.** The gap-analysis commit is the final commit on the milestone branch; the branch's first push happens here.

Lite tier has no separate Stage E — close the milestone with a one-paragraph CHANGELOG entry + the PR description instead.

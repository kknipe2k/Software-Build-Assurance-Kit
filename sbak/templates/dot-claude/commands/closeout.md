---
description: Run milestone closeout (Stage E) (e.g. /closeout M01)
argument-hint: <milestone>  — e.g. M01
---

You are a **build session running closeout (Stage E)** for the named milestone. Confirm orientation loaded (`[read-first stamp]`) before starting.

Arguments: `$ARGUMENTS` (the milestone id, e.g. `M01`).

Steps:

1. Open `docs/build-prompts/<milestone>-*.md` and find its closeout section — the `<closeout_stage_prompt>` block — and follow it.
2. Full closeout produces: the milestone summary (`prompts/SUMMARY-TEMPLATE.md`), an append-only entry in `docs/gap-analysis.md` (never edit prior lines — append-only by Hard Rule; the CI diff check that enforces it is risk-armed, arriving with `append-only-ledger.yml` when a risk trigger is declared), a `CHANGELOG.md` entry, and a draft PR description. Run the three-artifact review.
3. **v1 boundary check:** surface the explicit choice — continue to the next milestone / ship v1 here and roll the remainder / pause for re-tier. Don't silently default to "continue."
4. Surface the closeout packet and wait — **do not commit, push, or open a PR without approval.** The gap-analysis commit is the final commit on the milestone branch; the branch's first push happens here.

Lite tier has no separate Stage E — close the milestone with a one-paragraph CHANGELOG entry + the PR description instead.

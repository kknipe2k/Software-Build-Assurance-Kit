# {{PROJECT_NAME}} — Release-State Ladder

> Append-only record of the project's climb up the **six-state release ladder**. "Released" is not one undifferentiated claim — it is a sequence of **separately-gated** states, each citing the gate it passed. The release end is **SLSA-mapped** so a "distributable" claim is the one that proves provenance, never a cover for unsigned binaries or untested installers. See `sbak/BUILD-PLAYBOOK.md` §"Release-state ladder" and gate **G15** (`validators/validate-transition.cjs`).

---

## Append-only rule (HARD)

This file is one of the project's append-only ledgers (per `CLAUDE.md` §4 rule 4). **No prior entry may be edited, reordered, or deleted.**

Enforced by the kit's shared append-only checker — `validators/check-append-only.cjs`, run on every PR by `.github/workflows/append-only-ledger.yml` (generated when a risk trigger arms it; advisory by convention otherwise): prior committed content must remain a byte-prefix of the current file. This is the **same** check that guards `docs/gap-analysis.md` and `docs/tech-debt.md` — the release-state ledger simply joins that workflow's `LEDGERS` set; there is no separate workflow.

### Why append-only

A release claim is the most load-bearing transition a project makes. The ladder's value is forensic: a future session (or auditor) reading "we reached `packaged-release-ready` here, citing SLSA Build L2, and `public-distribution-ready` here, citing the independent review" can trust the climb was earned. **Rewriting it would let an unproven "released" be retroactively laundered into a proven one** — exactly the dishonest transition the ladder exists to prevent.

---

## The six-state ladder

Each state is a **separately-gated** transition. A state may not be claimed until the prior state is recorded and the named gate passes; the validator (`validate-transition.cjs`) blocks a skipped state and an atomic-write violation, and the closeout's rework count reconciles against the evidence (G15).

| # | State | What it means | Gate the transition must pass |
|---|---|---|---|
| 1 | **stage-complete** | a single stage's acceptance criteria met, committed on the milestone branch | the stage gates (`docs/gates.md`) + the stage retro `[END]` |
| 2 | **milestone-complete** | the milestone closed out, Verifier passed, count reconciled | Stage V Sound + Stage E closeout (count + rework reconcile) |
| 3 | **internally-usable** | the assembled product runs end-to-end for the team (dogfood) | assembled-execution (G10) on the drivable surfaces |
| 4 | **source-release-ready** | the source tree is releasable — license, README, no secrets, clean build | the full local matrix (`scripts/verify-local.cjs`) + secret scan |
| 5 | **packaged-release-ready** | distributable artifacts built + **SLSA-attested** | `release.yml` builds + **cites its SLSA build level** (≥ L2) |
| 6 | **public-distribution-ready** | cleared for public distribution | the capability-triggered independent whole-product review (when triggers declared) + the SLSA cite (G16) |

**SLSA mapping (the release end).** States 5–6 are where the ladder maps to [SLSA build levels](https://slsa.dev): a `packaged-release-ready` / `public-distribution-ready` entry **must cite its SLSA build level** (the default floor is **Build L2** via `actions/attest-build-provenance` — artifact↔build-instructions, Sigstore-signed, transparency log; **L3** via the reusable-workflow generator is the documented upgrade). So the transition that says "distributable" is the one that proves where the bytes came from.

---

## Entry shape

```
## {{YYYY-MM-DD}} — reached `{{state}}` ({{milestone / release tag}})
- Prior state: `{{the state below this one}}`  (recorded {{date}})
- Gate passed: {{the named gate for this transition — e.g. "Stage V Sound + E reconcile", "release.yml SLSA Build L2"}}
- SLSA build level (states 5–6 only): {{L2 | L3 | n/a — not at the packaged end yet}}
- Rendered receipt (states 5–6 only): {{.claude/receipts/<tag>.html (the `build-receipts render` output) | n/a — no receipt collected}}
- Rework so far (four-type, honest): implementation {{N}} / verifier {{N}} / irl {{N}} / post-merge {{N}}
- Evidence: {{run reference / commit range / attestation}}
- Notes: {{anything an auditor needs}}
```

---

## Entries

<!--
Append new entries below this line. Newest at the bottom. Do NOT edit prior entries —
a recorded release state, once logged, is permanent. Example:

## 2026-06-12 — reached `packaged-release-ready` (v1.0.0-rc1)
- Prior state: `source-release-ready`  (recorded 2026-06-10)
- Gate passed: release.yml built the macOS + linux artifacts; attest-build-provenance ran
- SLSA build level: L2 (actions/attest-build-provenance — Sigstore-signed, in the transparency log)
- Rendered receipt: .claude/receipts/v1.0.0-rc1.html (the `build-receipts render` output — token/time/rework accounting)
- Rework so far (four-type, honest): implementation 3 / verifier 1 / irl 0 / post-merge 0
- Evidence: run https://github.com/<org>/<repo>/actions/runs/<id>; attestation digest sha256:<...>
- Notes: macOS leg signed + notarized; the public-distribution review is the next transition.
-->

---

*Paired with `sbak/BUILD-PLAYBOOK.md` (the ladder definition), `release.yml` (the SLSA attestation), and gate **G15** / **G16** (`validators/validate-transition.cjs` / `validate-release-readiness.cjs`).*

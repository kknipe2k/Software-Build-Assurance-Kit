# Changelog

Release history of the Software Build Assurance Kit, in the same shape as the release notes - capabilities, limitations, evidence - never a build diary. Full detail for the current release: [RELEASE-NOTES.md](RELEASE-NOTES.md).

## v1.0.5 - 2026-08-31

**The current release** - the cold-start patch on the GA release; full detail in [RELEASE-NOTES.md](RELEASE-NOTES.md). No interface changes to the build loop. This patch closes what the first fresh bootstrap on the previous release and a real multi-milestone build surfaced: the install story, the opening ceremony, the cost of starting a session, and the handoff between the two terminals.

- **Capabilities.** Everything in v1.0.4, plus:
  - One-file install and upgrade: `sbak-install.cjs`, attested beside the ZIP, drives the whole install from inside `claude` - checksum and attestation verified, blast radius disclosed, one question at a time answered by the word that names the action, nothing written before your word, a real `CLAUDE.md` combined through one import line rather than replaced; the same command upgrades an installed kit and keeps what you modified; the bootstrap-filled files (the pre-commit hook and `verify-local`) stay at the installed version and are named - migrate them by hand until `kit-update --migrate` lands. The signed ZIP stays the manual path.
  - One question opens the bootstrap: Full or Custom. Full infers the operating mode from your description and derives the risk posture from the spec, shown as one acceptance line; Custom runs the short interview. The boot-time ceremony that a read-only audit of every ritual could not tie to a named failure is gone.
  - Lazy orientation: the session-start stamp stays eager and a stampless session fails loud, while the reading list loads at its own moment with each read recorded; the red-approval refuses a stage whose required reads were never recorded.
  - A file-based channel between the orchestrator and builder terminals: stage packets and verdicts travel over an append-only log with automatic pickup in both directions; approvals stay the human's keystrokes.
  - Verification lanes in the generated project's floor: `fast` / `stage` / `release` over one registry, an always class, settled marking for closed milestones with an affected-files override, and a union pin; the test estate is reviewed at closeout.
  - The accumulated field findings: the settings deny list names the real `.env` variants and no catch-all (the mandated `.env.example` passes); the retrospective ends in a machine-checked handoff note; the closeout packet leads with deltas-from-plan and the open findings and is validated before it surfaces; the release-state row is required at closeout; the gate manifest is validated.
- **Limitations.** Unchanged from v1.0.4: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** Every mechanical change is pinned by the kit's regression suite (the suite that gates releases in the kit's development repo - run on Windows during development and on Linux CI), with the failing check recorded before each fix; the installer was driven by the owner on a real Windows machine before it shipped, and the cut's clean-environment verify drives it again on the published assets, including the POSIX hook-execution leg. Built from a signed tag and published with SLSA Level 2 build provenance covering both the ZIP and the installer.

## v1.0.4 - 2026-08-05

A field-test patch on the GA release. No interface changes. This patch closes what the first real end-to-end adoption surfaced: one new enforcement surface, mechanical support at the session-topology transitions, a regex-construction hardening pass, and the documentation fixes a real user hit.

- **Capabilities.** Everything in v1.0.3, plus:
  - A human-drive floor, both halves: a Full-tier spec must carry the in-real-life / human-in-the-loop plan section (a mandatory prose instruction is now mechanically checked), and the milestone closeout consumes that section - human-typed drive answers are required beside the closeout stamp before the closeout counts. The defect class this closes: a milestone shipping green with no human ever running the app.
  - Sessions self-identify at the topology transitions: the session-start stamp states in plain words what the session is (orchestrator / builder / verifier) plus the checkout topology where derivable; the mode-setting script prints the launch-order line that kills the shared-role-file race; a topology assist reports when the worktree split is available and prints the exact steps.
  - Regex construction across the validator layer is hardened: one shared escape routine, every concatenated pattern site enumerated and conformed, with probes proving a metacharacter payload cannot bend a verdict. The public repository's code-scanning findings were adjudicated in the same pass - two fixed at their true sites, one a documented false positive - and the kit's own scanning now runs the same widened query suite an adopter's default setup runs.
  - Line endings are pinned at the repository root (`.gitattributes`), closing the case where a default Windows clone produced a CRLF working tree and every byte-exact check failed; a Windows CI job now reproduces that exact environment on every push, and that job caught a second Windows-only defect this patch closes: the adopt step now recognizes its own repository when the working path rides an 8.3 short-name alias (the alias and the long form compared as different directories before, and adopt refused to arm the hooks).
  - The documentation fixes a real adoption surfaced: the releases-page download anchor, the two-terminal handoff walkthrough, the worktree-split delivery, the entry README's flow alignment, and the human-stamp wording stating what the stamp actually attests. The scaffold also authors the formatter's ignore fence when a formatter is in the stack, so a whole-tree format run can never silently rewrite kit-managed trees - the field case was 31 files rewritten with zero failure surface.
- **Limitations.** Unchanged from v1.0.3: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** Every mechanical change is pinned by the kit's regression suite (the suite that gates releases in the kit's development repo), with the failing check recorded before each fix; the findings driving this patch came from a real adoption run end-to-end, not from an internal review. Built from a signed tag and published with SLSA Level 2 build provenance.

## v1.0.3 - 2026-08-01

A hardening patch on the GA release. No new features and no interface changes: the documentation brought to consistency in one pass against final behavior, and the release chain plus the enforcement layer hardened.

- **Capabilities.** Everything in v1.0.2, plus the hardening:
  - Every release-version literal in checks and shipped pages is derived from one root (the release manifest), and a sweep fails the build on a stale version literal in a live-claim position - the defect class that once let an old version ride through three releases in a shipped page.
  - Require resolution is verified across the assembled tree before a tag is cut, including dynamically composed requires and files that execute both at their staged position and at their rendered path - the packaging defect class that reached the public CI once now fails pre-tag.
  - A zero-recorded-executions detector: a control with no recorded run is reported rather than presumed effective.
  - The adopt step fails closed at every destination: an unclassified destination row is an install error, never a default.
  - The retired role-file alias is removed; one file is the single role marker.
  - The stage gate's self-approval carve: the gate's own control files (the approval marker, its allow list, the hook settings) are refused to agent edit-tool writes before any allow rule is consulted, so an agent can no longer write its own stage approval. The residual is stated in the hook source: engaged-gate-only, a raised bar rather than a wall.
  - The verifier calibration exam made realistic: all eleven fixtures rewritten as plausible artifacts with neutral filenames, answers held only in a sealed label set, and a leak probe run on the result (eleven of eleven fixtures leaked their defect class by filename before; zero of eleven after).
  - The kit's own regression suite hardened: narrowed section runs now fail loudly when a check's fixture depends on a section the run suppressed - a defect of exactly that class passed on Windows and failed only on Linux CI before the fix.
  - CI and the generated workflows pin actions/checkout v7.0.1, with the emitted pins moved in the same change as the live ones.
- **Limitations.** Unchanged from the GA release: [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md).
- **Evidence.** The hardening changes are pinned by the kit's regression suite, with the failing check recorded before each fix; the counted claims here (fixture and leak-probe counts) are machine-sourced from those runs. Built from a signed tag and published with SLSA Level 2 build provenance.

## v1.0.2 - 2026-07

**The GA release** - kit content is identical to v1.0.1; this is the attested cut.

- **Capabilities.** Everything in v1.0.1, republished with verified provenance: the calibrated bootstrap (two tiers, four operating modes), the red-first stage loop with hook enforcement, calibration-gated blind verification, verification lanes over one registry, the self-tested enforcement layer, build receipts, and tag-built artifacts.
- **Limitations.** The honest list is in [RELEASE-NOTES.md](RELEASE-NOTES.md) and [docs/limitations.md](docs/limitations.md): no human security audit, no worked example ships, macOS never run, the weight is real on small solo builds.
- **Evidence.** Built from the same signed tag content as v1.0.1 and published with SLSA Level 2 build provenance; `gh attestation verify` resolves on this release's asset. The five GA decision-record properties were each demonstrated by execution, twice (framework gates plus an independent fresh-context verifier).

## v1.0.1 - 2026-07

Published before its attestation ran, then superseded by v1.0.2 (identical kit content). The release stands - the repository's immutable-release protection correctly locked it, so its page cannot be corrected in place - but its body's verification instructions do not work for its own asset. Unsupported; use v1.0.2.

## v1.0.0 - 2026-07

Tagged during release preparation, never published. The public repository's CI caught a packaging defect (a shipped validator whose dependency had no manifest row) before any release page existed; the fix shipped as v1.0.1.

## v0.2.0 - 2026-07

The first release under the name Software Build Assurance Kit: the same kit, renamed and re-cut, with a rebuilt public entry.

- **Capabilities.** The calibrated bootstrap (tiers and operating modes), the red-first stage loop with hook enforcement, calibration-gated blind verification, the self-tested enforcement layer, evidence receipts, and tag-built provenance-carrying artifacts. New in this release: the entry pages [docs/what-this-is.md](docs/what-this-is.md), [docs/positioning.md](docs/positioning.md), and [docs/limitations.md](docs/limitations.md), plus this changelog.
- **Limitations.** Experimental; interfaces break between 0.x releases; no worked example ships; no human security audit has been performed. The full honest list: [docs/limitations.md](docs/limitations.md).
- **Evidence.** CI runs the kit's enforcement layer against the kit on every push; artifacts are built from a signed tag and carry SLSA Level 2 build provenance; the documentation's counted claims are machine-checked against the code.

## v0.1.0 - 2026-07

The first public cut, under the kit's earlier working name.

- **Capabilities.** The same core at its first published state: the bootstrap interview, the stage loop, the blind verifier, and the enforcement suite.
- **Limitations.** As above, with a thinner entry: the what-this-is / positioning / limitations pages did not yet exist.
- **Evidence.** The same CI self-enforcement and tag-built artifact discipline, at SLSA Level 2.

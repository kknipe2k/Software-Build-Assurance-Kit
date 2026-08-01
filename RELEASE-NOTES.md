# Release notes - v1.0.3

**This is the current release of the Software Build Assurance Kit - a hardening patch on the GA release.** The 1.0 bar is an integrity bar, not a feature bar: five decision-record properties, each demonstrated absent-of-defect **by execution** on verifier-built fixtures, in the authoritative CI environment. The evidence trail for every claim below is public in this repository's checks and in `example-receipt.html`.

Read this page before you adopt the kit for anything you care about. It says what works, what does not, and what evidence backs each claim. The release history in the same shape is in [CHANGELOG.md](CHANGELOG.md).

## What v1.0.3 changes

No new features and no interface changes. This patch brings the documentation to consistency in one pass against final behavior, and hardens the release chain and the enforcement layer:

- **Release-version literals are derived, and staleness fails the build.** Every version string in checks and shipped pages derives from one root (the release manifest), and a sweep rejects a stale version literal in a live-claim position - the defect class that once let an old version ride through three releases in a shipped page.
- **Require resolution is verified across the assembled tree before a tag is cut** - including dynamically composed requires, and files that execute both at their staged position and at their rendered path. The packaging defect class that reached the public CI once now fails pre-tag.
- **A zero-recorded-executions detector.** A control with no recorded run is reported rather than presumed effective.
- **The adopt step fails closed at every destination.** An unclassified destination row is an install error, never a default.
- **The retired role-file alias is removed**; one file is the single role marker.
- **The stage gate's self-approval carve.** The gate's own control files (the approval marker, its allow list, the hook settings) are refused to agent edit-tool writes before any allow rule is consulted, so an agent can no longer write its own stage approval. The residual is stated in the hook source: this holds while the gate is engaged, and it raises the bar rather than building a wall.
- **The verifier calibration exam is now realistic.** All eleven fixtures were rewritten as plausible artifacts with neutral filenames, the answers live only in a sealed label set, and a leak probe runs on the result: eleven of eleven fixtures leaked their defect class by filename before; zero of eleven after.
- **The kit's own regression suite hardened** - the suite that gates releases in the kit's development repo. Narrowed section runs now fail loudly when a check's fixture depends on a section the run suppressed - a defect of exactly that class passed on Windows and failed only on Linux CI before the fix.
- **CI and the generated workflows pin actions/checkout v7.0.1**, with the emitted pins moved in the same change as the live ones.

## What GA means here

The GA decision record required, and independent verification confirmed by execution:

1. **Adoption never mutates outside the project root** - symlink escapes (external, internal, dangling) are refused at every install site, targets byte-untouched, loudly and non-zero.
2. **Adoption never reports success with controls dormant** - hook wiredness is parsed, not pattern-matched; a fresh session proves the read-first stamp before success is claimed.
3. **The release verification lane has no silent or required skip** - every task appears in the run's own machine-readable summary with a verdict; a required skip is a failure, never a pass.
4. **POSIX hook liveness is proven, not assumed** - rendered hooks execute on Linux CI with the executable bit asserted; a Windows-local green is disclosed as non-authoritative at the point of use.
5. **A failed settings merge cannot destroy user settings** - byte-exact archive, atomic replace, auto-restore proven on a planted mid-write failure; unparseable settings are never replaced.

Each was verified twice: by the framework's own gates, and by an independent fresh-context verifier session that built its own fixtures and reproduced the release lane in a pristine clone.

## Capabilities

- **A calibrated bootstrap.** Three asks - operating mode, tier (Full or Lite), risk triggers - plus one confirmation turn; everything else is derived by a script from a single authority file and surfaced with its one-line why. No interview sprawl.
- **Four operating modes.** `greenfield` builds something new. `bug_fix` reproduces a defect, fixes it minimally, and verifies once. `audit` reviews an existing codebase and produces findings rather than code. `research_publish` synthesizes sources into a paper plus an illustrative app, with every claim bound to a logged source.
- **A red-first stage loop with teeth.** A hook blocks edits to implementation files while a stage is open and the failing test has not yet been approved by a human. Tests come before code because the tooling will not permit the reverse.
- **Blind verification with a calibration gate.** Each milestone ends with a verifier session whose reading list structurally omits the builder's notes. Before its findings are counted, it must catch every defect in a seeded set. A verifier that misses seeded defects is not trusted with real ones.
- **Verification lanes over one registry.** `verify-local --lane fast|integration|journey|release` - four filters over a single task registry, with `release` derived as the complete registry so omission is structurally impossible. Every run emits a deterministic JSON summary (verdicts, named skip reasons, durations in stated milliseconds, a registry hash). The bare invocation is the complete floor; the fast lanes are developer feedback and are never release evidence.
- **An enforcement layer that is itself tested.** Validators and hooks guard the stage protocol, the retrospective stamp, test honesty, risk declarations, destructive operations, release readiness, entry-doc drift, spec-example coverage, and more - and an enumeration check in CI proves each shipped validator is catalogued everywhere that lists them. A regression suite proves each check still fires; `sbak/scripts/bake-inheritance.cjs` ships as the effectiveness proof a reader can run.
- **Evidence you can read.** Sessions leave append-only event ledgers. A collector turns those plus committed history into a deterministic report bound to real commits, showing findings, fixes, and rework - with unknown values reported as unknown rather than as zero.
- **Reproducible, provenance-carrying artifacts.** The starter archive is built from a signed tag, never from a working tree. The same tag always produces the same hash. This release's artifact is `sbak-v1.0.3-starter.zip`.
- **Runs on a supported runtime.** CI and the generated workflows pin Node 24 (Active LTS), and a floor check derives the minimum Node the kit's own prescribed test form requires from the prescription itself - the pins and the prescription cannot silently diverge again.

## Limitations

The honest list. Every item here is a reason not to trust the kit further than it has earned:

- **On a small solo build the weight is not worth it, and the trial that showed this was our own.** The same small markdown-to-HTML CLI was built twice - once under this framework, once under a lightweight control loop. The framework arm cost **≈13.6× the dollars** and **≈10.9× the API time**. Its ratified adjudication FAILED two of its six thresholds **for that project class**: adaptability and economic justification. Four passed, including one evidence-bound prevented defect class (command injection) and full cost visibility. The multiple is not smaller than stated, and it is not claimed to hold beyond a small solo CLI. Reducing the weight is the next major version's entire purpose, triggered by evidence of a user who is not the author. The full record - pre-registration, both arms' costs, the independent evaluator's scores - lives in the kit's source repository under `docs/trial/`; it is deliberately not shipped in this release.
- **No worked example ships in this release.** There is no end-to-end tutorial project you can read start to finish. `example-receipt.html` is real - derived from the source repository's actual commits, findings, and rework - but it is evidence of the process running, not a guided walkthrough.
- **No human security audit has been performed.** None is claimed. Build provenance stops at SLSA Level 2. Absence of a claim is not a claim of absence.
- **Verified on Windows and Linux; macOS has never run it.** Linux CI (`ubuntu-latest`, Node 24) is the authoritative verification environment; Windows is the development floor; there is no platform matrix and none is claimed. The scripts are dependency-free Node written to be portable, but no macOS run exists - intent is not verification.
- **The overhead is real and sometimes not worth it.** For work that fits in an afternoon, or throwaway code, or a project no one will ever need to reconstruct, this kit costs more than it returns. `WHY-THIS-KIT.md` names the cases where you should not use it, and means them.
- **The static gate floors cover four language families** - JS/TS/JSX-TSX, Python, Go, and Rust. Anything else gets a visible skip line plus verifier-stage coverage. Disclosed, never silent, but a skip is a skip.
- **The permission fence is a fence, not a sandbox.** Its deny rules have known bypasses. Keep secrets off disk.
- **Token cost is higher than a plain instruction file.** The kit caps per-session reading lists to keep this bounded, but a framework of this size costs more to run than a concise `CLAUDE.md`.
- **The human stamp is load-bearing.** Not by reading the code - by reading the agent's review and the orchestrator's comments and running any live testing before stamping. Rubber-stamp the stages and every control in the kit degrades to ceremony.
- **Pin a tag.** Releases are snapshots of a privately developed kit. Interfaces may still change between releases; pin the tag you verified.
- **Pull requests are not accepted.** Development is private and this is a snapshot. Issues are read; no response time is promised.

## Evidence

What backs the claims above, and how you can check it yourself:

- **Continuous integration runs the kit's enforcement layer against the kit, on the pinned runtime.** On every push and pull request: the stage-prompt schema check over every phase document; the enumeration check proving each shipped validator is catalogued everywhere that lists them; the seeded-defect calibration set, checked in both directions so no fixture leaks its own answer; the entry-doc drift engine, including numeric self-description claims; the golden-scaffold check, so a template edit cannot silently change what a bootstrapped project receives; a bake harness that renders a real project, plants a violation, and requires the inherited validator to reject it; and the complete release verification lane with its machine-readable summary. Presence is never taken for effectiveness.
- **The build receipt is real.** `example-receipt.html` is derived by the collectors from this repository's own commits, findings, and rework. It is not a staged demonstration and it does not hide its gaps: intervals that are unknown are printed as unknown.
- **The GA decision record is executed, not asserted.** Every one of the five properties above was demonstrated by running the defect's attack shape against real artifacts - planted symlinks, torn writes, missing shells, drifted copies - and watching the control refuse, restore, or fail loudly. The verification transcripts live in the source repository's verifier findings.

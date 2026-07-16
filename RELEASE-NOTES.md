# Release notes — v0.2.0

**This is an experimental release.** It is the first release under the name Software Build Assurance Kit, and the second public cut of the kit. Interfaces, file layouts, and command names will break between 0.x releases without a deprecation period. Nothing here is stable yet, and nothing here should be assumed safe because it is published.

Read this page before you adopt the kit for anything you care about. It says what works, what does not, and what evidence backs each claim. The release history in the same shape is in [CHANGELOG.md](CHANGELOG.md).

## Capabilities

What the kit does today, on any project you copy it into:

- **A calibrated bootstrap.** A short interview sets a tier (Lite, Standard, Full), an experience level, an approval cadence, a deliverable type, and where tests run. The kit then writes a scaffold sized to that answer — roughly 36, 68, or 69 files. Re-tier later by editing one file and logging why.
- **Four operating modes.** `greenfield` builds something new. `bug_fix` reproduces a defect, fixes it minimally, and verifies once. `audit` reviews an existing codebase and produces findings rather than code. `research_publish` synthesizes sources into a paper plus an illustrative app, with every claim bound to a logged source.
- **A red-first stage loop with teeth.** A hook blocks edits to implementation files while a stage is open and the failing test has not yet been approved by a human. Tests come before code because the tooling will not permit the reverse.
- **Blind verification with a calibration gate.** Each milestone ends with a verifier session whose reading list structurally omits the builder's notes. Before its findings are counted, it must catch every defect in a seeded set. A verifier that misses seeded defects is not trusted with real ones.
- **An enforcement layer that is itself tested.** 16 validators and 4 hooks, plus committed git hooks, guard the stage protocol, the retrospective stamp, test honesty, risk declarations, destructive operations, release readiness, and more. A regression suite in the development repository proves each check still fires (remove a check's teeth and a test goes red); `scripts/bake-and-test.cjs` ships as the effectiveness proof a reader can run.
- **Evidence you can read.** Sessions leave append-only event ledgers. A collector turns those plus committed history into a deterministic report bound to real commits, showing findings, fixes, and rework — with unknown values reported as unknown rather than as zero.
- **Reproducible, provenance-carrying artifacts.** The starter archive is built from a signed tag via `git archive`, never from a working tree. The same tag always produces the same hash.
- **An entry you can evaluate in one sitting.** New at this release: [docs/what-this-is.md](docs/what-this-is.md) answers the is-it questions straight, [docs/positioning.md](docs/positioning.md) names where other tools are stronger, and [docs/limitations.md](docs/limitations.md) carries the boundary list the validators themselves disclose.

## Limitations

The honest list. Every item here is a reason not to trust the kit further than it has earned:

- **No worked example ships in this release.** There is no end-to-end tutorial project you can read start to finish. The kit's own build receipt is included as `example-receipt.html`, and it is real — derived from this repository's actual commits, findings, and rework — but it is evidence of the process running, not a guided walkthrough. A worked example is planned for a later release.
- **No human security audit has been performed.** None is claimed. The release ladder stops at packaged-release-ready, with build provenance at SLSA Level 2 and nothing beyond it. Absence of a claim is not a claim of absence.
- **Experimental, and interfaces will break.** Pin a tag. Do not track the default branch.
- **The overhead is real and sometimes not worth it.** For work that fits in an afternoon, or throwaway code, or a project no one will ever need to reconstruct, this kit costs more than it returns. `WHY-THIS-KIT.md` names the cases where you should not use it, and means them.
- **The static gate floors cover four language families** — JS/TS/JSX-TSX, Python, Go, and Rust. Anything else gets a visible skip line plus verifier-stage coverage. Disclosed, never silent, but a skip is a skip.
- **The permission fence is a fence, not a sandbox.** Its deny rules have known bypasses. Keep secrets off disk.
- **Token cost is higher than a plain instruction file.** The kit caps per-session reading lists to keep this bounded, but a framework of this size costs more to run than a concise `CLAUDE.md`.
- **The human stamp is load-bearing.** If stages are approved without reading the diffs, every control in the kit degrades to ceremony.
- **No controlled study shows this approach beats a concise instruction file plus tests plus code review.** The design is a reasoned bet on the evidence, not a demonstrated win.
- **Pull requests are not accepted at v0.x.** Development is private and this is a snapshot. Issues are read; no response time is promised.

## Evidence

What backs the claims above, and how you can check it yourself:

- **Continuous integration runs the kit's enforcement layer against the kit.** On every push and pull request: the stage-prompt schema check over every phase document; an enumeration check proving each shipped validator is catalogued everywhere that lists them; the seeded-defect calibration set, checked in both directions so no fixture leaks its own answer; a self-description check proving the numbers in the documentation match the code they describe; the golden-scaffold check, so a template edit cannot silently change what a bootstrapped project receives; and a bake harness that renders a real project, plants a violation, and requires the inherited validator to reject it. Presence is never taken for effectiveness.
- **The build receipt is real.** `example-receipt.html` is derived by the collectors from this repository's own commits, findings, and rework. It is not a staged demonstration and it does not hide its gaps: intervals that are unknown are printed as unknown.
- **Artifacts are verifiable.** `sbak-v0.2.0-starter.zip` ships with a `.sha256`. It is built from the signed tag, not a working tree, and carries SLSA Level 2 build provenance. Building the same tag twice produces the same hash.
- **The claims in the documentation are machine-checked.** Counts, gate ranges, the protocol version, and the covered-language set are derived from the code and validated in CI. A number that drifts fails the build rather than quietly misleading a reader.
- **The research behind the design, including the evidence against it,** is collected in `WHY-THIS-KIT.md` with citations pointing in both directions.

## Getting started

`README.md` for the overview, `QUICKSTART.md` for the ten-minute path, `HOW-IT-WORKS.html` for a visual tour, `WHY-THIS-KIT.md` if you are still deciding.

Run the kit from inside your own project directory — not in a clone of this repository. It writes into the directory it is run from.

## License

MIT. Copyright (c) 2026 Kurt Knipe.

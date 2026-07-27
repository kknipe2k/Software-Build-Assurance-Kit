# Limitations

The honest list, kept in step with the validators that print these caveats — the machine-checked boundary statements below are policed against the code, not maintained by hand. Every entry is a reason not to trust the kit further than it has earned. If a limitation you hit is missing here, that is a documentation bug; file it.

## Boundaries the validators themselves disclose

These three caveats are printed by the enforcement layer at run time; this page represents each one:

- **Covered stacks: JS/TS/JSX-TSX, Python, Go, Rust — no other language family gets the static floors.** A source file outside those families gets a **visible skip** line from the test-honesty gate (its output says `assertion-honesty not evaluated for` that extension) rather than silent acceptance. Disclosed, never silent — but a skip is a skip.
- **The commit-time floors do not evaluate other-stack files at all; Stage V carries the check.** The pre-commit output states this boundary on every commit that stages such files, and the verifier session is where those files get their coverage.
- **The documentation self-check polices specific value classes in a specific doc set** — counted claims, versions, names. It is not a promise that docs can't drift in ways it doesn't model.

## Boundaries of the design itself

- **The ML assurance profile is designed and ratified, but not implemented.** Machine-learning work — training, evaluation, promotion decisions — has a designed part-two profile, ratified and scheduled after this release. Nothing in this version evaluates ML-specific risk.
- **The permission fence is a fence, not a sandbox.** Its deny rules have known bypasses — a subprocess can read what the tool layer would refuse — so keep secrets off disk and use a secret manager plus your operating system's sandbox.
- **The human stamp is load-bearing.** If stages are approved without reading the diffs, every control in the kit degrades to ceremony. The framework's own data says the human review is the one control that cannot be automated away.
- **Token cost is higher than a plain instruction file.** Per-session reading lists are capped to bound it, but a framework of this size costs more to run than a bare `CLAUDE.md`.
- **No controlled study shows this approach beats a concise instruction file plus tests plus code review.** The design is a reasoned bet on the published evidence, not a demonstrated win.
- **On a small solo build the weight is not worth it, and the trial that showed this was our own.** The same small markdown-to-HTML CLI was built twice — once under this framework, once under a lightweight control loop. The framework arm cost **≈13.6× the dollars** and **≈10.9× the API time**. Its ratified adjudication FAILED two of its six thresholds **for that project class**: adaptability (when a late change landed, the accumulated artifacts became the larger liability) and economic justification (the incremental spend bought one prevented defect class plus traceability). Four thresholds passed, including one evidence-bound prevented defect and full cost visibility. Both halves are the disclosure: the multiple is not smaller than stated, and it is not claimed to hold beyond a small solo CLI. **Reducing this weight is the next major version's entire purpose**, and it is triggered by evidence of a user who is not the author — until then the weight stays, disclosed. The full record — pre-registration, both arms' costs, the independent evaluator's scores, the threshold adjudication — is in `docs/trial/` **in this kit's source repository**; it is deliberately not shipped in this release, which carries the kit and nothing else.

## Boundaries of this release

- **Verified on Windows and Linux; macOS has never run it.** Development and every release gate ran on Windows (Node 22+, Git, PowerShell/Git Bash); CI runs the same suites on Linux (`ubuntu-latest`, Node 24). The scripts are dependency-free Node written to be portable, but no macOS run exists — intent is not verification.
- **Experimental, and interfaces will break** between 0.x releases without a deprecation period. Pin a tag; do not track the default branch.
- **No worked example ships.** The build receipt included as evidence is real, but it is not a guided walkthrough.
- **No human security audit has been performed.** None is claimed. See [SECURITY.md](../SECURITY.md).
- **Pull requests are not accepted at v0.x.** Development is private and this is a published snapshot; issues are read, and no response time is promised.

The full context for each release-scoped item is in [RELEASE-NOTES.md](../RELEASE-NOTES.md); the when-not-to-use-this cases are in [WHY-THIS-KIT.md](../WHY-THIS-KIT.md).

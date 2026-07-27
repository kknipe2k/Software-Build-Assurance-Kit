# Contributing

Thank you for looking at the Software Build Assurance Kit. Please read this first — the contribution model here is unusual, and knowing it up front will save you effort.

## The posture, plainly

**Development happens in a private repository.** What you see here is a published snapshot. Its history starts at v0.1.0 by design; there is no upstream commit log to read, and there is nowhere for a pull request to merge back to.

**Pull requests are not the model at v0.x.** If you open one, it will not be rude — it will just be stranded. Please open an issue instead and describe the change you would have made. That reaches the same place with less of your time spent.

**Issues are read and reviewed. No response time is promised.** This is a solo, experimental project. Silence means a queue, not a verdict.

**Pull requests may open in a later version.** If and when they do, this file will say so, and the requirement below will apply.

## What is most useful to file

In rough order of how much they help:

1. **False greens.** A gate that passed when it should have failed. This is the failure mode the kit exists to prevent, and the one a maintainer cannot find alone. If you can describe what the check *should* have caught, that is the single most valuable issue you can open.
2. **Bootstrap failures.** The kit wrote the wrong files, wrote them in the wrong place, or refused to run in a directory it should have handled.
3. **Bugs in the validators or hooks.** Something rejected work that was correct, or accepted work that was not.
4. **Documentation that misled you.** If a page told you a number, a path, or a command that turned out to be wrong, that is a bug and it is tracked as one.

Please include your operating system, your Node.js version, the operating mode and tier you were running, and the exact command and output. A reproducer beats a description.

## Before any future pull request

Should pull requests open in a later version, run the checks locally first. They are the same ones CI runs, they need no network and no secrets, and they take seconds. The kit payload lives under `sbak/` (CI sets the same working directory), so from the repository root:

```
cd sbak
node validators/validate-stage-prompts.cjs --templates
node validators/validate-stage-prompts.cjs --allow-placeholders templates/BUGFIX-PHASE-DOC.md
node validators/validate-validator-enumeration.cjs
node validators/validate-entry-docs.cjs --surface
node validators/validate-calibration.cjs --set prompts/calibration --catalog STAGE-PROMPT-PROTOCOL.md
node scripts/golden-bootstrap.cjs --check-manifest
node scripts/golden-bootstrap.cjs --diff
node scripts/bake-inheritance.cjs
```

A change that alters what a bootstrapped project receives will fail the golden checks until the committed manifest is re-derived. That is intentional: the manifest is re-derived by the tooling, never hand-edited.

## Conduct

Be direct and be civil. Issues here are read by one maintainer, and a plain, respectful report is the fastest path to a fix.

## Security

Do not report vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the MIT License that covers this project. See [LICENSE](LICENSE).

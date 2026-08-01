# Security Policy

## Supported versions

Only the latest 1.x release is supported with security fixes. There are no long-term support branches, and superseded releases are not patched.

| Version | Supported | Why |
|---|---|---|
| Latest 1.x release | Yes | The GA line - the release the README badge points at |
| v1.0.1 | No | Published before attestation and superseded; the release is locked immutable, so its page cannot be corrected in place |
| v1.0.0 | No | Tagged during release preparation, never published |
| Any 0.x release | No | Pre-GA snapshots; unsupported |

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report it privately through GitHub Private Vulnerability Reporting:

**[Open a private security advisory](https://github.com/kknipe2k/Software-Build-Assurance-Kit/security/advisories/new)**

That channel is private between you and the maintainer until an advisory is published. It is the only reporting channel for vulnerabilities.

Please include the version or commit you tested, the platform and Node.js version, what an attacker gains, and a reproducer if you have one.

This is a solo project. Reports are read and taken seriously, but no response time and no fix timeline are promised. If a report is valid and a fix ships, you will be credited in the advisory unless you ask not to be.

## What this project claims, and what it does not

Being precise about this matters more than sounding safe:

- **No human security audit has been performed on this code.** None is claimed anywhere. GA is an integrity claim about the process evidence, not an audit claim.
- **Release artifacts are built from a signed tag, never a working tree**, and carry build provenance at SLSA Level 2. The same tag reproduces the same archive hash. Verify the published `.sha256` before you unpack a download.
- **The kit's own enforcement layer runs against itself in CI** on every push and pull request. That proves the checks fire; it does not prove the absence of vulnerabilities.
- **The permission fence shipped in the scaffold is a fence, not a sandbox.** Its deny rules have known bypasses - a subprocess can open a file the tool layer would refuse - so keep secrets out of the repository and off disk, and use a secret manager plus your operating system's sandbox. The kit's documentation states this in the same terms; treat any stronger claim you read elsewhere as wrong.
- **The kit runs an AI agent against your code and writes files into your working directory.** Review what it writes. That is what the human approval stages are for.

## Scope

In scope: the validators, hooks, and scripts in this repository; the bootstrap process; the release artifacts and their provenance.

Out of scope: vulnerabilities in Node.js, in your AI coding assistant, or in a project the kit generated but that you have since modified. Report those to their maintainers.

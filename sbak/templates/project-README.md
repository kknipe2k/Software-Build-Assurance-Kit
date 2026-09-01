# {{PROJECT_NAME}}

{{ONE_LINE_WHAT_THIS_IS — the identity one-liner; keep it in sync with `docs/identity.md` "What this is"}}

---

## Requirements

- {{RUNTIME_AND_VERSION — e.g. Node.js 22+}}
- {{ANY_OTHER_PREREQUISITE — delete this line if there is none}}

## Getting started

```
{{INSTALL_CMD}}
```

Then install the git hooks once — this is what puts the project's own checks in front of every commit:

```
node scripts/install-hooks.cjs
```

## Running it

```
{{RUN_CMD}}
```

## Build, test, lint

| What | Command |
|---|---|
| Test | `{{TEST_CMD}}` |
| Lint | `{{LINT_CMD}}` |
| Build | `{{BUILD_CMD}}` |
| Types | `{{TYPECHECK_CMD}}` |
| Fast lane (what pre-push runs: affected + this milestone's + always-tagged tests) | `node scripts/verify-local.cjs --lane fast` |
| Full local matrix (closeout, Stage V, tags) | `node scripts/verify-local.cjs --lane release` |

## Project docs

| Doc | What it answers |
|---|---|
| `docs/identity.md` | What this is, what it isn't, and the locked stack |
| `docs/scope.md` | The phased milestone scope |
| `docs/backlog.md` | The ranked backlog — what gets built next, and why |
| `CHANGELOG.md` | What shipped, per release |
| `CLAUDE.md` | The execution rules an AI session must follow in this repo |

## License

{{LICENSE_TYPE}} — see [`LICENSE`](LICENSE).

## AI assistance disclosure

<!--
  OWNER CHOICE (PROJECT-CLAUDE.md §13). This project was built with AI assistance under
  the Software Build Assurance Kit. Disclosing that is the owner's call, not the agent's —
  so this section ships as a choice, never as a pre-written claim on your behalf.

  Pick ONE and delete the rest, including this comment:

    (a) Disclose, with the process named:
        Parts of this project were developed with AI assistance (Claude Code) under the
        Software Build Assurance Kit — a gated build process with human approval at every
        stage boundary, test-first enforcement, and an independent verification pass.

    (b) Disclose, plainly:
        Parts of this project were developed with AI assistance.

    (c) No disclosure — delete this whole section.

  If your project takes outside contributions, §8's byline decision belongs here too:
  say once, in this section, how AI-assisted contributions are attributed in commits and
  release notes, so contributors are not left guessing per-PR.
-->

{{AI_DISCLOSURE_CHOICE — resolve the comment above, then delete it}}

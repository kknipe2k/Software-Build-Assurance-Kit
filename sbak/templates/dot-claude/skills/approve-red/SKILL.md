---
description: Approve the open stage's RED tests, unlocking implementation edits (human action)
disable-model-invocation: true
---

You are confirming, **as the human reviewer**, that you have read the surfaced failing (RED) tests for the open stage and approve their design. This is gate 2 of the three-gate per-stage loop (plan → **red** → stage-end).

This is YOUR action, not the agent's — run it only after you have actually reviewed the test files the agent surfaced at the red-stop.

> **The RED-RELEASE line (M22 ruling 5).** In the two-brain flow the release arrives in the orchestrator's RED verdict packet as the explicit line `RED-RELEASE: approved - builder, run node scripts/approve-red.cjs --stage <id> --release-seq <n>`; the agent may run the command **only in response to that line**, with this command's `ask` prompt as your release click. Approval language without the line **is not a release** — the agent stops and tells you `/approve-red` is required. (Running it yourself, here or from your own shell, always works too.)

Steps:

1. Run `node scripts/approve-red.cjs --stage <id> --release-seq <n>` as one command, nothing before or after it: `<id>` is the open stage (`.claude/stage-active`), `<n>` is the seq of the pending approval-request (the RED verdict on the channel), or `none` when no verdict is pending. It refuses any other stage or seq, and the red-gate refuses any other form of the command. It first checks the read ledger: every read-first entry tagged `when: stage-open` and every path in the open stage prompt's `<read_first>` must have a recorded read (Read tool or Bash) - if one is missing it refuses with one line naming the file, and the agent reads it and you re-run. Then it records the approval (below) and atomically writes `.claude/red-approved`: the stage id, then the line that binds the record.
2. The PROC-001 PreToolUse red-gate now allows implementation edits for **this** stage, while the approval stands. A later `/stage` clears the approval (a fresh stage starts un-approved); so does closing the stage at commit (`node scripts/stage-active.cjs --clear`, which also archives the record into `.claude/measurements/<stage>/`).

If it errors with "no .claude/stage-active", there is no open stage — the gate is dormant and nothing needs approving.

**The approval record.** Every release appends one approval row to `.claude/channel/approval.json` and writes the marker as two lines: the stage id, then `record <sha256 of that row>`. The row says who released (the session's role), where (the repository identity), when (the prompt's time), the session, the released seq, the commit it was approved at, the scope (the Phase doc, its blob, and the sha256 of the stage's section) and every test file changed at approval, by sha256 and by its bytes in git's object store. A re-approval appends a row; nothing is overwritten. The release refuses, and approves nothing, when it cannot record this evidence: a missing `scripts/lib/read-ledger.cjs`, `scripts/lib/channel.cjs` or `scripts/lib/receipts.cjs` is one line naming the step and the repair, `node scripts/kit-update.cjs --adopt`. A release whose RED set is empty (no test file differs from HEAD), or that git cannot list (not a repository, or git did not run), is refused the same way: nothing is written.

**The five cases.** A change after the release is judged by what it touches, never by a hash alone:

| Case | Who decides | What checks it |
|---|---|---|
| (1) Implementation changes while the tests are made to pass | nobody: this is expected | nothing |
| (2) An edit inside an approved test file | the orchestrator's ack, with no keystroke from you | `channel.cjs publish --kind amendment`, then `channel.cjs ack`, which prints each file's diff summary |
| (3) A test file added, an approved one deleted or renamed, or a new stage id | you, with `/approve-red` again; the approval is void until then | the red gate checks the approved files before each implementation edit; the stage-end publish refuses a test file added after the release, and an approved one that is missing or renamed |
| (4) The approved scope section changed in the Phase doc | the orchestrator sends the amended scope, then you run `/approve-red`; void until then | the amendment and stage-end publishes compare the section with the one recorded |
| (5) An amendment that removes or loosens an assertion | you, with `/approve-red`: the ack refuses it | the ack recounts the amended file with the test-honesty counters: fewer assertions, a skip or todo added, a literal changed, or an assertion rewritten |

**Un-approve (the void).** To take a release back, run `node scripts/approve-red.cjs --stage <id> --void --reason "<text>"` as one command. It appends a `void` row to the record, removes the marker and records a `red_voided` receipt; the next implementation edit is refused with `[red-gate] approval void - stage <id>'s RED approval was voided (<text>); the owner runs /approve-red`. The reason is 1 to 200 characters in double quotes, with none of `"`, `$`, a backtick, a backslash, `;`, `&`, `|`, `<` or `>`. The same permission prompt asks for it, because it is the same script.

> Honest scope: the gate is a process bar-raise, not a wall. It judges the edit tools and a short list of shell write constructs (a parser, not a sandbox: a script that writes a file itself is not judged). It catches an approved test file deleted, renamed or changed without an ack before the next implementation edit, and the ack refuses a loosened assertion; a test written weak before the release is caught only by this red-review and a mutation-kill check.

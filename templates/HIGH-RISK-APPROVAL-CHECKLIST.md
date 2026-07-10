# High-Risk Approval Checklist — challenge-and-response

> **What this is.** The approval protocol for any **risk-trigger surface** (the enumerated list in `FRAMEWORK-CONFIG.md` §4.19 — destructive data ops, archive/backup-restore/extraction, filesystem writes from untrusted metadata, credentials/provider config, generated/untrusted HTML or executable content, installers/updaters/release artifacts). When the work in front of you touches one of those, a bare "Approve?" is not enough: the approver answers these five questions *before* approving. This is the EU AI Act Art. 14 human-oversight control — the overseer must understand, monitor, and be able to **override**, not rubber-stamp.
>
> **When it does NOT fire.** A change with **no declared risk trigger** (the common case — a Lite project editing a doc, a routine reversible feature) uses the normal per-stage approval. This checklist is **added rigor on the high-stakes surfaces only**, never a universal extra approval. If you find yourself filling it for every change, the risk-trigger scoping has drifted — fix the scoping, don't dilute the checklist.
>
> **What it is NOT.** This is **human oversight, not technical enforcement.** The M08 permission fence (`.claude/settings.json`) still applies underneath — `git commit`/`git push` stay `ask`, the deny floor still walls off secret reads and irreversible Bash — but the fence's three honest caveats hold (see `CLAUDE.md` §6.5): the deny floor has bypasses, `.claudeignore` is broken, and a web-remote session ignores repo-set `auto`. The checklist closes the *judgment* gap (the approver thinking before clicking), not a technical one. Don't read a filled checklist as a guarantee the op is safe — read it as evidence the approver looked.

---

## The five points

Answer each before approving a risk-trigger surface. "I don't know" on any line is a **stop** — get the answer or decline.

### 1. Intent — what is this, and why?
- What does this operation actually do, in one sentence?
- Why is it being done now? What goal does it serve?
- Is this the *minimal* action that achieves the goal, or is it doing more than asked?

### 2. Data lineage — what data, from where, and is it trusted?
- What data does this read or write?
- Where did that data originate — a trusted local source, or untrusted input (a downloaded archive, user-supplied path, network response, generated content)?
- If any input is untrusted, is it validated/sanitized before use? (For untrusted **paths**, the canonicalize-then-confine primitive in `docs/style.md` is mandatory — resolve canonical, confine to the subtree with a separator boundary.)

### 3. Permissions chain — what authority does this exercise?
- What capabilities/permissions does this operation require (filesystem write, credential read, network egress, process spawn, package install)?
- Whose authority is it acting under, and is that authority appropriate for the task?
- Does it escalate — acquire more access than the task needs? (OWASP "excessive agency" — the agentic-risk this checklist exists to catch.)

### 4. Blast radius — what else could this touch?
- If this goes wrong, what is the worst it can affect? (One file? A directory? The whole tree? A remote?)
- What is **outside** the intended target that this *could* reach (symlinks, `../` traversal, glob over-match, a shared resource)?
- Is the blast radius confined by construction, or only by the input behaving well?

### 5. Rollback plan — how is this undone?
- If this op produces a bad result, exactly how is it reversed?
- Is the operation failure-safe by construction (write-temp-then-rename, transactional, backup-first), or does a mid-operation failure leave a corrupted/partial state?
- Has the rollback path itself been tested — not assumed? (The destructive-op hard rule, `BUILD-PLAYBOOK.md`: rollback **and** confinement are two independent tests; a passing rollback test is not evidence of confinement.)

---

## How to use it

1. The agent surfacing a risk-trigger operation for approval **names the trigger** ("this is a destructive data op (restore)") and fills what it can of the five points as part of its approval surface.
2. The human approver reads the five answers, challenges any that are thin or "I don't know," and only then approves — or declines and sends it back.
3. The fence still gates the mechanics: `git commit`/`git push` remain `ask`, so even a checklist-approved op does not auto-commit. The checklist governs the *decision*; the fence governs the *action*.

> **Honest limit.** A checklist can be filled carelessly — five glib answers pass it as readily as five careful ones. Its value is forcing the approver to *look* at intent, lineage, authority, blast radius, and rollback before committing to a high-stakes action. It is a bar-raise on human judgment, not a wall. Pair it with the destructive-op tests (rollback + confinement) and the fail-closed enforcement paths — the checklist is the human layer of defense-in-depth, not the only one.

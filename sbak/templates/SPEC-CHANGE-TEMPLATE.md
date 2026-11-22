# Change {{NNNN}}: {{the change in one line}}

> One requirement change, one file: copy this to `spec/changes/NNNN-<slug>.md` (the next number, four digits), fill every field, edit `spec/live-spec.md` to the updated contract, then run `node validators/validate-spec-chain.cjs --change spec/changes/NNNN-<slug>.md`. That command checks the fields, writes the live spec's sha256 before and after into the two lines below and adds the link to `spec/spec-chain.json`; stage the live spec, this file and the chain together and commit them as one. The commit floor refuses a live-spec edit with no change file in the same commit, and a change whose hashes do not chain (deterministic enforcement). It compares the hashes with the bytes; it does not check who wrote this file or the approval line. The original spec (`spec/project-spec.md`) never changes.

**Milestone:** {{the milestone whose stage implements this change, e.g. M03: its closeout lists it}}
**Requirement ids:** {{the live-spec ids it touches, e.g. REQ-003, REQ-001; a new requirement takes the next free id}}
**Assumptions touched:** {{the rows of the live spec's Assumptions section it touches, or none}}
**Live spec before:** (written by --change)
**Live spec after:** (written by --change)

## 1. Current contract

{{the live spec's text for those ids, quoted as it stands now}}

## 2. Requested change

{{what is asked, and by whom}}

## 3. Behaviour preserved

{{what must keep working exactly as it does now}}

## 4. Affected tests

{{one line per test, by path and label: - `tests/count.test.cjs` - counts lines. The stage that implements this change names them in its RED; whether they assert the right result is the reviewer's to judge}}

## 5. Updated contract

{{the live spec's text for those ids after the change, as spec/live-spec.md now carries it}}

## Approval

**Approved:** {{the person's typed word, their name and the time, e.g. approve - Dana - 2026-11-20 10:00 UTC}}

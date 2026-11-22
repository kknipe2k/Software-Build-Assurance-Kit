# Spec challenge - the second look before the freeze

> The fresh-context spec challenge (Full, bootstrap Phase 1, before `node validators/validate-spec-chain.cjs --freeze`). The original spec is frozen at the bootstrap commit, so a requirement it misses then costs a change file. This prompt runs in a fresh context that reads the draft spec and the discovery notes only, never the conversation that wrote them and never a plan, and hunts for what the author missed: in Claude Code a subagent given this prompt as written, on another host a new session. Its findings and the sign-off lines are recorded in `spec/spec-challenge.md` in the shape below; the freeze and the bootstrap commit refuse a Full spec without that record (deterministic enforcement). The kit records the text: it does not check that the session was fresh, what it read, or who signed.

## The prompt (paste it as written; fill nothing)

You are challenging a draft specification before it is frozen. Read these two files and nothing else:

**Read set:** spec/project-spec.md, spec/discovery-notes.md

Do not read the conversation that wrote them, any plan, or any other file in this project. Hunt for what is missing, not for what is there:

1. A requirement the discovery notes imply that the spec does not state.
2. An assumption the spec rests on that its Assumptions section does not name, with what would show it false.
3. A requirement stated so that no test could show it met or not met.
4. An open question the spec answers by silence.

Write one table row per finding: the finding, and the spec line or discovery note it comes from. Write "none found" only after all four hunts.

## The record (`spec/spec-challenge.md`)

The bootstrap session writes it from the challenge's findings. Each finding is folded into the spec (its requirement id or section named), added to the Assumptions section, or answered in a line on why it stays out; then the spec is surfaced for acceptance and the person signs off.

```
# Spec challenge

**Challenge:** run
**Read set:** spec/project-spec.md, spec/discovery-notes.md

## Findings

| Finding | Disposition |
|---|---|
| {{the finding, as the challenge wrote it, or: none found}} | {{folded into the spec (the REQ- id or the section), added to the Assumptions section, or answered: one line on why it stays out}} |

## Sign-off

**Signed off:** {{the person's typed word, their name and the time, e.g. accept - Dana - 2026-11-20 10:00 UTC}}
**Second sign-off:** {{the second person's typed word, their name and the time, or exactly: no second person}}
```

The person may decline the challenge. The record then reads `**Challenge:** declined - <the person's typed word, their name and the time>`, with no read set and no findings, and the two sign-off lines as above (human authorization).

What the freeze refuses (deterministic enforcement): no record; a read set naming anything but `spec/project-spec.md` and `spec/discovery-notes.md`, or a file it names that is absent; a run with no findings row, or a row with no disposition; a missing or placeholder sign-off line; a second sign-off that is neither a line nor the words `no second person`.

# Persistence Architecture — How Memory and Instructions Flow Across the Build

> **Human reader: you can skip this file.** It is part of the agent's operating manual — a reference the build sessions consult, deliberately exhaustive. Start at `README.md` → `QUICKSTART.md`, and ask questions in-session rather than reading ahead.

> **Purpose.** The high-level architecture of how the framework's documents, retrospectives, and protocols persist and flow across Claude sessions, stages, and milestones. Use it to answer: *"Where does this information live? Who reads it? Who writes it? When does it become immutable?"*
>
> **Companion to** `BUILD-PLAYBOOK.md` (the methodology) and `STAGE-PROMPT-PROTOCOL.md` (the XML schema for stage prompts). This file is the **persistence model** the playbook depends on.

---

## 1. The five persistence layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — STATIC CONTRACT          (changes via ADR only)          │
│  • spec/project-spec.md              (what we're building)          │
│  • schemas/*.v1.* (if applicable)    (source-of-truth types)        │
│  • examples/ (if applicable)         (archetype proofs)             │
│  • LICENSE                                                          │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ (rarely edited; ADR required)
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — SLOW-EVOLVING PROTOCOL   (auto-loaded every session)     │
│  • CLAUDE.md                         (Hard Rules, gates, workflow)  │
│  • project-config.md               (active tier + toggles + log)  │
│  • BUILD-PLAYBOOK.md                 (methodology — framework-level)│
│  • FRAMEWORK-CONFIG.md               (tier/toggle reference)        │
│  • STAGE-PROMPT-PROTOCOL.md          (XML schema — framework-level) │
│  • PROCESS-VALIDATION.md             (scoring — framework-level)    │
│  • persistence-architecture.md       (this file — framework-level)  │
│  • docs/identity.md                  (project identity)             │
│  • docs/scope.md                     (phased milestone scope)       │
│  • docs/gates.md                     (Full; gate matrix)           │
│  • docs/style.md                     (Full; style + naming)        │
│  • docs/gotchas.md                   (Full; running traps)         │
│  • docs/adr/                         (Full; immut. once accept)    │
│  • prompts/PHASE-DOC-TEMPLATE.md     (Full; per-milestone)         │
│  • prompts/RETROSPECTIVE-TEMPLATE.md (Full; per-stage shape)       │
│  • prompts/SUMMARY-TEMPLATE.md       (Full; per-milestone)         │
│  • .claude/settings.json             (Claude Code hook wiring)      │
│  • .claude/hooks/session-start-read-first.cjs (auto-loads read-list) │
│  • .claude/read-first-list*.txt      (work / verifier / orch lists) │
│  • ORCHESTRATOR.md  (Full; orchestration sessions ONLY)            │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ (per-milestone authoring)
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — PER-MILESTONE PROMPT     (one document per parent M[NN]) │
│  • docs/build-prompts/M[NN]-<title>.md                              │
│      Header (background, design decisions, scope)                   │
│      Stages A → B → C → D → E (each X.1 ... X.6)                    │
│      Summary table + verification checklist                         │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ (one fresh session per stage; cleared between)
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 4 — PER-SESSION MEMORY       (ephemeral; bounded by stage)   │
│  • The Claude Code session's context window                         │
│  • Files read at session start (Layer 1+2+3 + prior retros)         │
│  • Live retrospective tables filled as friction surfaces            │
│  • Code being written, gates being run                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ (writes back to Layer 5 at session end)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — STAGE OUTPUTS            (committed; some immutable)     │
│  • Code commits on the parent-milestone feature branch              │
│  • retrospectives/M[NN].<X>-retrospective.md                        │
│  • retrospectives/M[NN]-summary.md (final stage)                    │
│  • docs/gap-analysis.md  (APPEND-ONLY; per CLAUDE.md §4 + §20)      │
│  • docs/sessions.md      (APPEND-ONLY; session register)            │
│  • CHANGELOG.md updates                                             │
└─────────────────────────────────────────────────────────────────────┘
```

**Key property:** every layer below reads from layers above. Layer 1+2 load on every session; Layer 3 loads when the milestone starts; Layer 4 is the working memory for one stage; Layer 5 is what survives the stage and feeds the next.

**Tier-conditional Layer 2 contents.** Several Layer 2 files only exist at Full tier (marked above). In Lite tier, the bootstrap doesn't generate `gates.md`, `style.md`, `gotchas.md`, ADR scaffolding, the prompt templates, or `gap-analysis.md` — the project runs from a smaller orientation set and uses `CHANGELOG.md` for the role those files would play. The `project-config.md` file is the source of truth for which Layer 2 files apply; sessions read its toggles and behave accordingly.

**The SessionStart hook.** `.claude/hooks/session-start-read-first.cjs` (Node; cross-platform) is the enforcement bridge between Layer 2 (where the read-first list is documented) and Layer 4 (where it must actually be loaded). The hook reads `.claude/role`, selects the matching read-first list (`work` / `verifier` / `orchestrator`), applies the `read_first_cap` toggle, and prints contents to stdout — Claude Code injects stdout as additional session context. This makes the read-first list deterministic instead of honor-system. The hook prints a verification stamp (`[read-first stamp] role=<role>, op=<op>, loaded N files, N bytes, N skipped`) the agent should echo in its first response so the user can confirm the load happened.

**The session-role state file — a single marker, its compatibility window now closed.** The session role (work / verifier / orchestrator / refactor) is the bare token in **`.claude/role`**, written atomically by `scripts/set-mode.cjs`. That is the whole contract: one writer, one file, one marker every reader consults. This axis was renamed onto its current name so it no longer collides with the project-scoped `operating_mode` dial, and the rename opened a one-release compatibility window in which the writer also wrote a second, legacy-named marker and every reader fell back to it when `.claude/role` was absent. **That window is closed** — the second write and every reader fallback are removed, and a project that still carries only the pre-rename marker now reads as role-**absent**, which resolves to the `work` default and never to a role recovered from a retired file. Re-running `node scripts/set-mode.cjs <role>` (or re-bootstrapping) is the migration, and always was — buying time for exactly that was the window's purpose. A present-but-garbage `.claude/role` still fails closed and is never treated as `work`, now with no second marker it could leak through to. Living documentation describes the contract the product has, not the one it used to have.

**Two session types (Full).** The agent runs as an **orchestration session** (governed by `ORCHESTRATOR.md` + `CLAUDE.md`; authors Phase docs/ADRs, adjudicates, routes findings, runs PRs) or a **build/stage session** (governed by `CLAUDE.md` + its §X.5 stage prompt; executes one stage). They never share a session; the human is the conduit. `ORCHESTRATOR.md` loads only in `orchestrator` mode and is never read by a build/verifier/closeout session — the schema validator enforces that stage prompts never reference it. At Lite tier the two roles collapse into one session and `ORCHESTRATOR.md` is not generated.

---

## 2. Stage lifecycle — what one stage reads, writes, surfaces

```
                    ┌───────────────────────────────┐
                    │     STAGE X SESSION OPENS     │
                    │  (fresh context; branch:      │
                    │   claude/m[nn]-<title>)       │
                    └──────────────┬────────────────┘
                                   │
                                   ▼
              ┌────────────────────────────────────────────┐
              │  READ (in order)                           │
              │  1. CLAUDE.md                  (auto)      │
              │  2. BUILD-PLAYBOOK.md (relevant sections)  │
              │  3. M[NN]-<title>.md  X.1–X.4              │
              │  4. spec/project-spec.md (sections cited)  │
              │  5. ADRs (cited)                           │
              │  6. PRIOR-STAGE RETROSPECTIVES (X≥B)       │
              │     [END] Decisions for the next stage     │
              │     [LIVE] friction events (carry-forward) │
              │  7. docs/gap-analysis.md Carry-forward     │
              │     items targeting THIS stage             │
              │  8. docs/sessions.md (most recent entry)   │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  CROSS-MACHINE STATE CHECK                 │
              │  Surface: git log --oneline main..HEAD     │
              │  + ls retrospectives/M[NN].*-retrospective │
              │  Confirms what's actually on this machine  │
              │  vs. what origin shows (origin can lag)    │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  STATE PLAN (CLAUDE.md §16)                │
              │  • Deliverable in 1–3 sentences            │
              │  • Test plan in 3–5 bullets                │
              │  • WAIT for user confirmation              │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  COPY RETRO TEMPLATE                       │
              │  retrospectives/M[NN].<X>-retrospective.md │
              │  Begin filling [LIVE] tables AS work       │
              │  happens (not at end)                      │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  RED → GREEN → REFACTOR (CLAUDE.md §5)     │
              │  • Tests fail for the right reason         │
              │  • Hard-fail on missing exports (§5)       │
              │  • Minimum code to pass                    │
              │  • Refactor with tests passing             │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  VERIFY ALL GATES (docs/gates.md)          │
              │  Run every gate active for this milestone  │
              │  Self-correction loop, max 3 (§7)          │
              │  Cross-stack integration: escalate at 2    │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  FILL [END] RETROSPECTIVE                  │
              │  • Three-axis scoring (1–5 per row)        │
              │  • Threshold gates (5 hard + 5 soft)       │
              │  • OUTCOME (Sound / Sound-but-rough / ...) │
              │  • DECISIONS for the NEXT stage            │
              │    (specific: file:line, exact change)     │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  SURFACE TO USER                           │
              │  • git diff --stat                         │
              │  • Gate results                            │
              │  • Retrospective filled                    │
              │  • Draft commit message                    │
              │  • CROSS-MACHINE STATE                     │
              │      git log --oneline main..HEAD          │
              │      ls retrospectives/M[NN].*             │
              │  Says: "I will NOT commit until you        │
              │  approve."  WAIT.                          │
              └──────────────┬─────────────────────────────┘
                             │
                             ▼
                       ┌───────────┐
                       │  USER:    │
                       │ approved  │
                       └─────┬─────┘
                             │
                             ▼
              ┌────────────────────────────────────────────┐
              │  COMMIT (DCO sign-off, Conv. Commits)      │
              │  on parent-milestone feature branch        │
              │  Push waits until final stage              │
              │  PR opens only on final stage approval     │
              │  AND only if user explicitly asks          │
              └────────────────────────────────────────────┘
```

---

## 3. Cross-milestone flow — how M[NN] informs M[NN+1]

```
M01 lifecycle                                M02 lifecycle
─────────────                                ─────────────
  Stage A  ──→ writes  M01.A-retrospective       │
    │                                            │
    ▼                                            │
  Stage B  ──→ READS   M01.A retro             │
            ──→ writes  M01.B-retrospective      │
    │                                            │
    ▼                                            │
  Stage C  ──→ READS   M01.A + M01.B retros    │
            ──→ writes  M01.C-retrospective      │
    │                                            │
    ▼                                            │
  Stage D  ──→ READS   M01.A + M01.B + M01.C   │
            ──→ writes  M01.D-retrospective      │
            ──→ writes  M01-summary.md            │
    │                                            │
    ▼                                            │
  Stage E  ──→ READS   ALL prior retros + spec │
            ──→ APPENDS gap-analysis.md            │
                       M01 entry (IMMUTABLE)     │
            ──→ APPENDS sessions.md (M01 close)  │
            ──→ adds CI append-only gate         │
            ──→ drafts M01 PR                    │
                                                  │
       M01 PR merged ─────────────────────────────┘
                                                  ▼
                                        Stage A of M02
                                          │
                                          │ READS:
                                          │  • CLAUDE.md (Layer 2; may have new gotchas)
                                          │  • BUILD-PLAYBOOK.md (relevant sections)
                                          │  • M02-<title>.md (Layer 3; new prompt)
                                          │  • spec sections M02 touches
                                          │  • ADRs (existing + any added during M01)
                                          │  • docs/gap-analysis.md FULL HISTORY
                                          │     (incl. M01 entry — for Carry-forward)
                                          │  • docs/sessions.md (M01 close + any M02-prep)
                                          │  • docs/gotchas.md (graduated entries)
                                          │
                                          ▼
                                          ... and so on through final milestone
```

---

## 4. Mutability matrix — what can change, what can't

| Artifact | Mutable? | When/how it changes | Authoring |
|---|---|---|---|
| `project-config.md` | Evolves | Edits to tier or toggles per the override log (append-only). New entries below the log; prior entries never edited. | Per session, user-approved |
| `FRAMEWORK-CONFIG.md` | Slow | Framework-level reference; toggle schema or tier definition changes require ADR | Maintainer + ADR |
| `.claude/settings.json` + `.claude/hooks/...` | Evolves | Hook wiring changes when the protocol's enforcement model changes | Maintainer or per session |
| `.claude/read-first-list.txt` | Evolves | Updated when a new Phase doc opens or a new framework-level reference becomes load-bearing | Per stage / per milestone |
| `spec/project-spec.md` | Slow | ADR required for any change to architecture, schemas, gates, primitives | Maintainer + ADR |
| `schemas/*.v1.*` (if applicable) | Slow | Major bumps require new file `*.v2.*` + ADR; minor (additive) edits in-place | Maintainer + ADR |
| `examples/` (if applicable) | Slow | Changes evaluated against archetype matrix; archetype-breaking changes blocked | Maintainer |
| `CLAUDE.md` | Evolves | Edits when protocol changes (gates, hard rules, gotchas); commit history is the audit | Claude per session, user-approved |
| `BUILD-PLAYBOOK.md` | Slow | Framework-level; changes affect every future milestone (ADR required) | Maintainer + ADR |
| `STAGE-PROMPT-PROTOCOL.md` | Slow | Versioned; iterates with major framework bumps | Maintainer + ADR |
| `PROCESS-VALIDATION.md` | Slow | Framework-level reference; scoring or gate changes require ADR | Maintainer + ADR |
| `persistence-architecture.md` (this file) | Slow | Framework-level reference; layer-model changes require ADR | Maintainer + ADR |
| `docs/identity.md` | Slow | Stack changes / scope-identity changes require ADR | Maintainer + ADR |
| `docs/scope.md` | Evolves | Per milestone — checkboxes flip as criteria pass | Per stage |
| `docs/gates.md` | Evolves | Gates only added (not removed) without ADR; per-milestone activations recorded | Per milestone |
| `docs/style.md` | Slow | Convention changes require deliberate refactor or ADR | Maintainer |
| `docs/gotchas.md` | Evolves | Per-stage gotchas accumulate; graduate at closeout per `<gotchas_graduation>` | Per stage |
| `docs/adr/<NNNN>-*.md` | **IMMUTABLE once Accepted** | New ADR supersedes old (status flip) | Maintainer + reviewer |
| `docs/build-prompts/M[NN]-<title>.md` | Stable per milestone | Re-scoped only with ADR; substantive edits trigger phase-doc-edit pre-flight check | Authored before milestone starts |
| `prompts/PHASE-DOC-TEMPLATE.md` | Slow | Updated when retrospective findings reveal template gaps | Cross-milestone |
| `prompts/RETROSPECTIVE-TEMPLATE.md` | Slow | Updated when scoring or surface format evolves | Cross-milestone |
| `prompts/SUMMARY-TEMPLATE.md` | Slow | Updated when summary shape evolves | Cross-milestone |
| `retrospectives/M[NN].<X>-retrospective.md` | One-shot | Filled live during stage; finalized at stage end; not re-edited after | Per stage by Claude |
| `retrospectives/M[NN]-summary.md` | One-shot | Created at end of final work stage; aggregates the per-stage retros | Final work stage |
| **`docs/gap-analysis.md`** | **APPEND-ONLY FOREVER** (CLAUDE.md §4 + §20) | New entries only at the bottom; prior entries NEVER edited; CI enforces via diff check | Per parent milestone, in Phase Closeout |
| **`docs/sessions.md`** | **APPEND-ONLY FOREVER** (CLAUDE.md §4) | New session entries only at the bottom; prior entries NEVER edited; CI enforces | Per session |
| `CHANGELOG.md` | Evolves | `[Unreleased]` updated per stage; sections move to versioned headings at release | Per stage / per release |
| Source code directories | Evolves | Per TDD discipline (CLAUDE.md §5); commits land per stage approval | Per stage |

---

## 5. The "audit trail" through three artifacts

User reviews **three artifacts** at PR time per `CLAUDE.md` §8 + §19 + §20:

```
┌─────────────────────────────┐
│  1. CODE DIFF               │  Did the milestone deliver what
│     (the PR itself)         │  was promised?
└─────────────────────────────┘
              +
┌─────────────────────────────┐
│  2. RETROSPECTIVES          │  Was the build PROCESS sound?
│     M[NN].A through .D      │  • Three-axis scoring
│     M[NN]-summary           │  • Hard Gates (especially G1:
│                             │    do-not-commit-until-approved)
└─────────────────────────────┘
              +
┌─────────────────────────────┐
│  3. GAP-ANALYSIS ENTRY      │  Is the PRODUCT vs. SPEC
│     New section in          │  honest? Is the fix backlog
│     docs/gap-analysis.md    │  prioritized correctly?
│     (immutable once         │  • Cumulative across milestones
│      committed)             │  • Carry-forward from prior
└─────────────────────────────┘

     Approval of all three → PR opens (and only if user explicitly asks)
```

---

## 6. Mermaid: full picture

```mermaid
graph TB
    subgraph L1["Layer 1 — Static Contract (ADR-gated)"]
        SPEC[spec/project-spec.md]
        SCHEMA["schemas/*.v1.* (if applicable)"]
        EX["examples/ (if applicable)"]
    end

    subgraph L2["Layer 2 — Slow-Evolving Protocol (auto-loaded every session)"]
        CLAUDE[CLAUDE.md]
        PLAYBOOK[BUILD-PLAYBOOK.md]
        STAGEPROTO[STAGE-PROMPT-PROTOCOL.md]
        PV[PROCESS-VALIDATION.md]
        PA[persistence-architecture.md]
        IDENT[docs/identity.md]
        SCOPE[docs/scope.md]
        GATES[docs/gates.md]
        STYLE[docs/style.md]
        GOTCHAS[docs/gotchas.md]
        ADR[docs/adr/]
        PHASETPL[prompts/PHASE-DOC-TEMPLATE.md]
        RETROTPL[prompts/RETROSPECTIVE-TEMPLATE.md]
        SUMTPL[prompts/SUMMARY-TEMPLATE.md]
    end

    subgraph L3["Layer 3 — Per-Milestone Prompt"]
        M01PROMPT[M01-foundation.md<br/>Stages A-E]
        M02PROMPT[M02-...md]
        MNN[...M[NN]]
    end

    subgraph L4["Layer 4 — Per-Session Memory (ephemeral)"]
        SESSION[Stage X<br/>Claude Code session]
    end

    subgraph L5["Layer 5 — Stage Outputs (committed)"]
        CODE[Code on parent-milestone branch]
        RETRO["retrospectives/M[NN].X-retrospective.md"]
        SUMMARY["retrospectives/M[NN]-summary.md"]
        GAP[docs/gap-analysis.md<br/>APPEND-ONLY]
        SESSIONS[docs/sessions.md<br/>APPEND-ONLY]
        CHANGELOG[CHANGELOG.md]
    end

    SPEC -.read.-> SESSION
    SCHEMA -.read.-> SESSION
    CLAUDE -.auto-load.-> SESSION
    PLAYBOOK -.read.-> SESSION
    SCOPE -.read.-> SESSION
    GATES -.read.-> SESSION
    PHASETPL -.shape.-> M01PROMPT
    PHASETPL -.shape.-> M02PROMPT
    RETROTPL -.shape.-> RETRO
    SUMTPL -.shape.-> SUMMARY
    ADR -.read.-> SESSION
    M01PROMPT -.read sections.-> SESSION

    SESSION ==write==> CODE
    SESSION ==write==> RETRO
    SESSION ==write final stage only==> SUMMARY
    SESSION ==append closeout only==> GAP
    SESSION ==append per session==> SESSIONS
    SESSION ==write==> CHANGELOG

    RETRO -.next stage reads.-> SESSION
    GAP -.carry-forward read by next milestone.-> SESSION
    SESSIONS -.next session reads.-> SESSION

    classDef immutable fill:#ff8888,stroke:#333,color:#000
    classDef append fill:#ffcc66,stroke:#333,color:#000
    class ADR,GAP,SESSIONS append
    class SPEC immutable
```

---

## 7. Practical reading list — what each session actually opens

### M01 Stage A (first stage of first milestone)
1. `CLAUDE.md` (auto)
2. `BUILD-PLAYBOOK.md` §3 (per-stage loop)
3. `docs/build-prompts/M01-<title>.md` sections A.1 → A.4
4. `spec/project-spec.md` (sections cited by M01)
5. ADRs cited by M01
6. `prompts/RETROSPECTIVE-TEMPLATE.md`
7. `docs/gates.md` (M01 row)

*(No prior retrospective to read — this is the first stage.)*

### M01 Stage B (second stage)
Stage A list **plus**:
- `retrospectives/M01.A-retrospective.md` ([END] Decisions section)
- `docs/gap-analysis.md` Carry-forward items targeting Stage B (if any pre-M01 entries exist)
- `docs/sessions.md` most recent entry

### M01 Phase Closeout (final stage, typically Stage E)
- All of `CLAUDE.md` (focus §4, §10, §17, §20)
- `BUILD-PLAYBOOK.md` §4 (closeout protocol)
- `docs/gap-analysis.md` header (entry template + append-only rule)
- `docs/build-prompts/M01-<title>.md` Stage E sections
- All prior retrospectives (M01.A → M01.D)
- `M01-summary.md`
- Cumulative read of every code file shipped across M01 stages
- `spec/project-spec.md` end-to-end skim

### M02 Stage A (first stage of second milestone, fresh session, fresh branch)
- `CLAUDE.md` (auto; may have new §15 gotchas added by M01)
- `BUILD-PLAYBOOK.md` (re-skim if updated)
- `docs/build-prompts/M02-<title>.md` A.1 → A.4
- `spec/project-spec.md` (M02 sections)
- ADRs (existing + any added during M01)
- `docs/gap-analysis.md` **full history** (Pre-M01 + M01 entry) — for Carry-forward of items targeting M02
- `docs/sessions.md` (M01 close + any M02-prep entries)
- `docs/gotchas.md` (graduated entries)
- `prompts/RETROSPECTIVE-TEMPLATE.md`

---

## 8. Why this architecture

1. **Constants in `CLAUDE.md`, methodology in framework files, variables in milestone prompts.** Protocol changes happen in one place; per-milestone scope changes don't bloat the protocol; framework changes don't bloat per-project state.
2. **Append-only gap-analysis is the audit trail.** Every milestone's product↔spec audit becomes part of the project's permanent record. Editing prior entries breaks the trail.
3. **Append-only sessions register is the operational audit.** Every session is logged; cross-machine state is recoverable from sessions.md alone.
4. **Retrospectives carry forward.** Decisions written at the end of Stage A are *read* at the start of Stage B — so lessons compound, not vanish.
5. **Three-artifact review at PR time.** Code (does it work?), retrospectives (was the process sound?), gap-analysis (is the audit honest?) — three different questions, three different artifacts, one merge gate.
6. **Fresh session per stage.** Bounds context, forces explicit reads, makes each session reproducible.
7. **Cross-machine state surfaced explicitly.** Origin can lag the build machine; surfacing `git log` + retro-file listing in every stage-end surface keeps orchestration sessions on different machines from inferring false premises (the "PR #53" failure mode).

---

## 9. References

- `CLAUDE.md` §4 Hard Rules, §5 TDD, §6 Gates, §7 Self-correction, §8 PR/commit, §10 Don't-touch, §12 Ask vs. proceed, §16 Session-start, §19 Retrospective Protocol, §20 Gap Analysis Protocol
- `BUILD-PLAYBOOK.md` §3 per-stage loop, §4 closeout, §5 retrospective protocol, §6 gap-analysis protocol
- `STAGE-PROMPT-PROTOCOL.md` — XML schema for stage CLI prompts (the prompts that load this persistence model on the build machine)
- `PROCESS-VALIDATION.md` — three-axis scoring, threshold gates that retrospectives evaluate
- `docs/gap-analysis.md` — entry template + append-only rule
- `docs/build-prompts/M[NN]-<title>.md` — concrete instance of the layered architecture

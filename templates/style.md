# {{PROJECT_NAME}} — Style Guide

> Conventions that apply across the codebase. Customized to the project's stack(s). Changes require an ADR if they would invalidate existing code; minor additions can be added directly with a note in the next milestone retrospective.

---

## Comments

**Default: don't write comments.** The code should be self-explanatory through naming and structure. Comments are a smell that the code isn't expressing intent clearly enough.

**Write comments when:**

- Explaining *why* something is done a non-obvious way (the *what* should be in the code)
- Marking a known limitation or trade-off the next reader needs
- Documenting a public API (the documentation system requires it)
- Naming an invariant that the type system can't capture (e.g., `// SAFETY:` blocks for low-level code)
- Citing a spec section, ADR, or external reference for context

**Don't write comments that:**

- Restate what the code obviously does (`// increment counter` above `counter += 1`)
- Describe what the code *will* do later (use a tracking issue or TODO with a name)
- Apologize for the code (just fix it)
- Repeat the function name in prose

---

## Naming

Project naming conventions follow the stack's idioms:

- **{{STACK_LANGUAGE_1}}:** {{NAMING_CONVENTIONS_1}} (e.g., snake_case for Rust, camelCase for TS)
- **{{STACK_LANGUAGE_2}}:** {{NAMING_CONVENTIONS_2}}
- **File names:** {{FILE_NAME_CONVENTIONS}}
- **Test names:** {{TEST_NAME_CONVENTIONS}} (e.g., `test_<unit>_<condition>_<expected>`)

**Project-wide:**

- Names describe **what something is or does**, not **what it's made of**. `OrderProcessor`, not `OrderClass`. `parseConfig`, not `configFunction`.
- Acronyms follow the stack's case rules. Be consistent within a file at minimum.
- Avoid Hungarian notation, type prefixes (`IFoo`, `CFoo`), or other type-encoding-in-name patterns.
- One concept = one name. If you find yourself with `User`, `Account`, and `Person` for the same thing, pick one.

---

## Functions

**Functions do one thing.** If the function name needs "and" in it, split.

**Function length:** target ≤50 lines. Hard ceiling 100 lines. Beyond that the function is doing too much; extract sub-functions with names that document the steps.

**Parameter count:** target ≤3. Beyond 4, group into a struct/object/record. The grouping itself is documentation of which parameters belong together.

**Return values:**

- One return type per function. Don't return a tuple of `(result, error_string, did_succeed)` — use the language's idiomatic error type.
- Avoid out-parameters when the language supports proper return types.
- Empty/optional results use the language's null-safe construct (`Option`, `Optional`, `Maybe`, `?`), not magic values like `-1` or `""`.

**Pure functions are preferred** where reasonable. Side effects make tests slower and bugs subtler. When a side effect is necessary, isolate it at the boundary of the call graph rather than scattered through helpers.

---

## Errors

**Capture root cause.** Wrapping an error to add context is good; swallowing the original is bad.

```
// good (pseudocode):
fn load_config(path) -> Result<Config, LoadError> {
    let bytes = read_file(path).map_err(|e| LoadError::Io { path, source: e })?;
    parse_config(bytes).map_err(|e| LoadError::Parse { path, source: e })
}

// bad: silent swallow
fn load_config(path) -> Result<Config, ()> {
    read_file(path).ok().and_then(parse_config).ok_or(())
}
```

**Errors are values, not exceptions** (in languages where this is a choice). Use the language's idiomatic Result/Either/Outcome type. Throw exceptions only in genuinely exceptional cases or where the language's ecosystem demands it.

**Don't use error messages for control flow.** If you need to branch on the kind of error, use typed error enums.

**Errors at module boundaries are documented.** Every public function that can fail names what failure modes are possible (in docstring or by Result type).

---

## Destructive operations & untrusted paths (G12)

A **destructive op** — any replace / import / restore / migrate / delete / extract / unzip / backup-restore — is **failure-safe by construction** and **tier-independent** (the rule holds at Lite as at Full, alongside the no-commit-without-approval rule). Two non-negotiables:

**1. The canonicalize-then-confine primitive — THE untrusted-path pattern.** Any time a destination is derived from an *untrusted* path (an archive entry name, an imported manifest, user-supplied metadata), confine it to its intended root with this exact shape:

- **Canonicalize first.** Resolve **both** the destination root and the candidate path to their **canonical absolute** form — `realpath` (or the stack's equivalent) so **symlinks are resolved**, `..` segments collapsed, and encoded sequences (`%2e`, `%2f`, `%5c`) decoded — *before* any comparison. Resolving symlinks is part of canonicalization, not optional: a symlink inside the root can still point outside it.
- **Then confine with a SEPARATOR boundary:**

  ```
  // pseudocode — fill the stack idiom; the SHAPE is the contract.
  const root      = realpath(destinationRoot);          // canonical, symlinks resolved
  const resolved  = realpath(join(root, untrustedPath)); // canonical, symlinks resolved
  const confined  = resolved === root || resolved.startsWith(root + path.sep);
  if (!confined) throw new ConfinementError(untrustedPath);
  ```

- **NEVER a bare `startsWith(root)`.** Without the trailing **separator**, root `/base` accepts the sibling `/base-evil` (the prefix bug — see `gotchas.md`). The boundary is `resolved === root` (the root itself) **OR** `resolved.startsWith(root + sep)` (something strictly *inside* it). This is the documented zip-slip / path-traversal fix (CVE-2025-62156 class).

This is a stack-agnostic **spec + reference pattern** — your project supplies the language idiom (`fs.realpathSync` + `path.sep` in Node, `Path.resolve().startswith` with `os.sep` in Python, `std::fs::canonicalize` in Rust). The *shape* — canonicalize (symlinks included) then confine with a separator boundary — does not vary.

**2. Tested for BOTH rollback AND confinement — two independent tests.** A destructive op ships with:

- a **rollback** test (the op is undoable on failure — write-temp-then-rename, or transactional), AND
- a **confinement** test that drives a **REAL** hostile path (`../../etc/passwd`, an encoded sequence, or a symlink escape) and asserts it is **rejected**.

These are **independent** — a perfect rollback test does **not** satisfy confinement. `rollback-passes != safe`: the canonical failure (an unconfined restore) proved rollback, had no confinement, and shipped a path-traversal because "rollback works" was read as "safe." A confinement test using a *toy* path the code trivially passes is theater — `validators/validate-destructive-op.cjs` (G12) blocks it, and Stage V confirms the path *genuinely* escapes.

---

## Logging

- Logs are for operators, not for debugging your current change.
- Each log line names the **subsystem** and the **event**. `network: dialing peer A`, not `dialing peer A`.
- Log levels: `error` (something the operator must act on), `warn` (something the operator should know about), `info` (a noteworthy event in the system's normal flow), `debug` (developer detail). Don't log at `info` what should be at `debug`.
- No PII or secrets in logs. Ever. Use redaction helpers if user data flows through logged paths.

---

## Anti-patterns (project-wide)

These are smells. PRs containing them get pushback.

- **Catch-all error handlers** that swallow specifics
- **Test helpers that test themselves** (a helper that mocks the function it's testing produces no signal)
- **Configuration via globals** (use dependency injection or context passing)
- **Cyclic module dependencies** (refactor to a clear dependency graph)
- **Mixing async and sync code** at function boundaries (pick one for each call site)
- **Code duplicated across modules** that should share a helper (DRY violation, but only after the rule of three — duplicate twice; on the third, extract)
- **Speculative generality** (interfaces with one implementation, factory functions for things that are always the same)
- **{{PROJECT_SPECIFIC_ANTI_PATTERN_1}}**
- **{{PROJECT_SPECIFIC_ANTI_PATTERN_2}}**

---

## Imports / dependencies

- **Prefer the standard library.** Adding a third-party dependency requires an ADR (per `CLAUDE.md` §4 rule 7).
- **Pin versions.** Open-ended version specs (`^1.0`, `~2`) are not allowed for production dependencies. Use exact versions or narrow ranges.
- **Group imports** in the language's idiomatic groups (stdlib / third-party / local). Most languages have a tool for this; it should be in the gate suite.

---

## Tests

See `CLAUDE.md` §5 for TDD discipline. Style-level rules:

- Test names describe behavior, not implementation: `test_returns_error_when_input_is_negative`, not `test_validate_input`.
- Each test asserts one thing. If a test has 5 unrelated assertions, it's 5 tests.
- Setup is explicit. Hidden setup in test fixtures that the test author didn't write makes failures hard to debug.
- Magic numbers in tests are named: `let TIMEOUT_SECS = 30;`, not `tokio::time::sleep(Duration::from_secs(30))` deep in the test body.

---

## Documentation

- Public API is documented (the doc-test gate enforces this).
- READMEs describe **what the module is** in the first paragraph and **how to use it** in the second.
- ADRs are the place for architecture rationale, not READMEs.
- Inline doc comments cite spec sections when relevant: `// see spec §3.2 — drone IPC framing`.

---

## Whitespace, formatting, mechanical style

Handled by the formatter (`{{FORMAT_TOOL}}`). Don't argue about it; let the tool decide. The format gate is mechanical and non-negotiable.

---

## Stack-specific notes

### {{STACK_LANGUAGE_1}}

{{LANGUAGE_1_SPECIFIC_GUIDANCE}}

### {{STACK_LANGUAGE_2}}

{{LANGUAGE_2_SPECIFIC_GUIDANCE}}

---

*Style is what lets a codebase feel like one author wrote it. Drift is reversible if you catch it; let it accumulate and the cost compounds.*

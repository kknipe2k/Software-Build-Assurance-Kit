# Seeded fixture — a `<risk_declaration>` naming a NON-COVERING test (the G13-floor gap)

A G13 `<risk_declaration>` property that NAMES a test which does not cover the property:

```xml
<property name="confinement">
  covered-by: path handling — test: import.spec.ts "imports a normal file"
</property>
```

The named test (`"imports a normal file"`) exercises only the happy path; it never drives a
traversal/escape input. **G13's floor sees a `test:` token and passes** — but the test does not
cover confinement. Only the adversary, reading the test body, catches that the coverage is *named
but absent*. This is the gap the prior stages owe Stage C.

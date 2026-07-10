# Seeded fixture — an n/a that is false

Excerpt from a work-stage `<risk_declaration>` for an archive-extraction capability:

```xml
<property name="confinement">n/a — the importer only reads entries into memory</property>
```

…but elsewhere the same stage writes each extracted entry to `outDir/<entry.name>` on disk.
The `n/a` for **confinement** is untrue: a `../` entry name escapes `outDir` (zip-slip). A static
validator cannot judge whether the risk surface truly exists — this is the G9/G13 presence-gated
escape hatch the adversary must close.

# Seeded fixture — a gate row that skips the gate-design contract

A new gate added to `docs/gates.md` whose row names neither an adversary nor a false-green:

```
| G15 — Widget integrity | a widget config file is present | a validator | — |
```

The "Prevents (false-green)" cell is blank and no Stage-V adversarial question is named. The
gate's existence is unjustified under the gate-design contract (a gate must name its
mechanical floor **and** its adversarial question **and** the false-green it prevents).

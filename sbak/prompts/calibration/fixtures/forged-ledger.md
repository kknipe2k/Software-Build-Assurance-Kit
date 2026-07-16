# Seeded fixture — a forged ledger that still reconciles

A reconcile block whose claimed count was hand-tuned to match a hand-tuned source:

```reconcile
metric: stages committed
claimed: 3
source: git
range: main..HEAD
pattern: ^M12\.[ABCD]:
```

The branch actually has 2 such commits; the `3` and the `pattern` were edited together so the
number recomputes against itself. It reconciles — but against a forged source, not the real log.

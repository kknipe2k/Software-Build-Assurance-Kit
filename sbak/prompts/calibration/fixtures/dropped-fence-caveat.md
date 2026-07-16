# Seeded fixture — a quietly-dropped fence caveat

A verifier findings file whose coverage caveat changed between revisions:

- **rev 1:** "Concurrency NOT checked at this tier; runtime/visual without a harness remains possible."
- **rev 2:** _(the caveat line removed)_

Nothing in the diff note explains the removal; the milestone now reads as broader coverage than it
has. The caveat was dropped to manufacture confidence, not because the gap closed.

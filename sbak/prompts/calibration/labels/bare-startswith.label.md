---
fixture: dest-check-diff.md
class: bare-startswith
expected: must-flag
---

**Sealed ground-truth — NOT read by the verifier during the calibration challenge.**

The verifier is scored on flagging the planted **bare-startswith** defect: confinement uses a bare `startsWith(root)` — `/base-evil` passes `/base`; missing the `+ sep` subtree check.

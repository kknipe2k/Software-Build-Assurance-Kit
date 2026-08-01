---
fixture: import-stage-excerpt.md
class: non-covering-test
expected: must-flag
---

**Sealed ground-truth — NOT read by the verifier during the calibration challenge.**

The verifier is scored on flagging the planted **non-covering-test** defect: the confinement property names a test (`"imports a normal file"`) that only covers the happy path — named coverage, but it does not cover the property. G13’s floor cannot see this.

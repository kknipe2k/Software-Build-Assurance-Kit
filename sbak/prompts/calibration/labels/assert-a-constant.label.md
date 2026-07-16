---
fixture: assert-a-constant.md
class: assert-a-constant
expected: must-flag
---

**Sealed ground-truth — NOT read by the verifier during the calibration challenge.**

The verifier is scored on flagging the planted **assert-a-constant** defect: the test asserts a hardcoded constant (`expect(true).toBe(true)`); it never exercises the code it claims to cover.

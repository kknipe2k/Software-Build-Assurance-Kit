---
fixture: traversal-suite-listing.md
class: toy-path-confinement
expected: must-flag
---

**Sealed ground-truth — NOT read by the verifier during the calibration challenge.**

The verifier is scored on flagging the planted **toy-path-confinement** defect: the confinement test uses only benign paths; it never drives a real `../`/encoded/symlink escape.

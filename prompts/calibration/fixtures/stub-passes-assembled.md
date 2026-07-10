# Seeded fixture — a stub that passes "assembled"

An App-Map entry marked `State: verified` whose Evidence cell cites a **unit** test:

```
| Save button | top-right | click | save-btn | saves doc | verified | unit: Button.spec.tsx mounts the component |
```

The `assembled_execution` claim is satisfied by a mounted-component unit test — the real running
surface was never driven. Unit/component green is necessary-not-sufficient for a runtime surface.

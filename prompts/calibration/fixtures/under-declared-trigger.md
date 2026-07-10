# Seeded fixture — an under-declared trigger

A `project-config.md` for a capability that restores a database backup:

```yaml
risk_triggers: []
```

The stage runs a destructive `restore` (drop-and-reload over user data), but declares **no**
risk trigger — dodging G11 escalation and the G12 destructive-op hard rule by simply not naming
the surface. The adversary must derive the trigger the plan omitted.

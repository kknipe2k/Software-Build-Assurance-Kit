# Seeded fixture — a bare startsWith(root)

The confinement primitive uses a raw prefix check:

```js
const resolved = path.resolve(root, userPath);
if (resolved.startsWith(root)) return resolved;   // BUG
```

`/base-evil`.startsWith(`/base`) is `true`, so a sibling directory passes confinement. It must be
`resolved === root || resolved.startsWith(root + path.sep)` after canonicalization (realpath).

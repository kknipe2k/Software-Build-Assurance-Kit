# Diff hunk - M04.B write-path check

```js
+const resolved = path.resolve(root, userPath);
+if (resolved.startsWith(root)) return resolved;
+throw new Error('destination outside project root');
```

# M04.A stage excerpt - archive import

From the stage's `<risk_declaration>`:

```xml
<property name="confinement">n/a - the importer only reads entries into memory</property>
```

From the same stage's implementation diff:

```js
for (const entry of zip.entries()) {
  const dest = path.join(outDir, entry.name);
  fs.writeFileSync(dest, entry.getData());
}
```

# Stage doc excerpt - M02.B file import

```xml
<risk_declaration>
  <property name="confinement">covered-by: path handling - test: import.spec.ts "imports a normal file"</property>
</risk_declaration>
```

The named spec, as committed:

```ts
it('imports a normal file', async () => {
  const res = await importFile('fixtures/a.txt');
  expect(res.ok).toBe(true);
});
```

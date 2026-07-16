# Seeded fixture — a toy-path confinement

A confinement test whose "hostile" path never actually escapes:

```js
it('rejects traversal', () => {
  expect(confine('safe/child.txt')).toBe(true);
  expect(confine('also/fine.txt')).toBe(true);
});
```

Both inputs are benign relative paths. No `../`, no encoded `%2e%2e`, no symlink — the test
asserts confinement without ever exercising a genuinely escaping path.

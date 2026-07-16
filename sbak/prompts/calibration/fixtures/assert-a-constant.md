# Seeded fixture — assert-a-constant

A staged test that ships green but proves nothing:

```js
it('confines the path', () => {
  const ok = true;            // not derived from the function under test
  expect(ok).toBe(true);
});
```

The assertion is a tautology — it never calls the confinement logic it claims to cover. Presence
of an assertion ≠ an effective one (a fixture that agrees with itself proves nothing).

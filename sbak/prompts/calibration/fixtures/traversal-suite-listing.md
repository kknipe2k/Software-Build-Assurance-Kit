# Test listing - extraction guard (M04)

```js
it('rejects traversal', () => {
  expect(confine('safe/child.txt')).toBe(true);
  expect(confine('also/fine.txt')).toBe(true);
});
```

Green since M04.B; listed as the covering test for the extraction guard.

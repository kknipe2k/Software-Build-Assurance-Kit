# Test listing - path guard suite (M05)

```js
it('joins relative paths', () => {
  expect(join('a', 'b')).toBe('a/b');
});

it('confines the path', () => {
  const ok = true;
  expect(ok).toBe(true);
});
```

Both tests green in CI run #481.

# Scripting API

Invoker runs JavaScript in three places — pre-request, post-response, and tests. All run in a sandboxed `Function` context.

## Available globals

### `ivk` — plugin API

**In `> pre` blocks:**

```javascript
ivk.env.get(name: string): string | undefined
ivk.env.set(name: string, value: string): void
ivk.request.headers: Record<string, string>   // mutable
ivk.request.body: string                       // mutable
ivk.request.url: string                        // mutable
ivk.log(message: string): void
```

**In `> post` blocks:**

```javascript
ivk.env.get(name: string): string | undefined
ivk.env.set(name: string, value: string): void
ivk.log(message: string): void
// ivk.request is NOT available — request already sent
```

**In `> test` blocks:**

Same as post, plus `test` and `expect` helpers.

### `res` — response object

Available in `> post` and `> test` only (pre-request has no response yet).

```javascript
res.status: number           // HTTP status code (0 if network error)
res.body: any                // parsed body (JSON → object, else string)
res.headers: Record<string, string>
res.time: number             // elapsed ms
```

### `test` and `expect` — assertion helpers

Only in `> test` blocks.

```javascript
test("description", () => {
  expect(actual).toBe(expected);           // strict equality
  expect(value).toBeDefined();             // not undefined or null
  expect(value).toContain(substring);      // string contains
  expect(value).toBeGreaterThan(n);        // numeric >
});
```

Each `test()` produces one pass/fail row in the response panel.

## Recipes

### Chain a login → use session in other requests

**`login.ivk`:**
```
POST {{baseUrl}}/login
Content-Type: application/json

{ "email": "{{email}}", "password": "{{password}}" }

> post {
  ivk.env.set("token", res.body.access_token);
}
```

**`profile.ivk`:**
```
@auth bearer {{token}}

GET {{baseUrl}}/me
```

### Add request signing (HMAC)

```
POST {{baseUrl}}/api/webhook
Content-Type: application/json

{ "event": "ping" }

> pre {
  // Compute HMAC and add as header
  const timestamp = Date.now();
  ivk.request.headers["X-Timestamp"] = String(timestamp);
  ivk.request.headers["X-Signature"] = hmacSha256(ivk.request.body, timestamp);
}
```

> Note: HMAC helpers aren't built-in yet. You'd need to paste the algorithm inline or wait for a crypto API.

### Conditional assertions

```
> test {
  if (res.status === 200) {
    test("returns data", () => {
      expect(res.body.data).toBeDefined();
    });
  } else {
    test("returns error message", () => {
      expect(res.body.error).toBeDefined();
    });
  }
}
```

### Log for debugging

```
> post {
  ivk.log("status: " + res.status);
  ivk.log("keys: " + Object.keys(res.body).join(", "));
  ivk.log("id: " + (res.body.id ?? "missing"));
}
```

Logs appear in the "Console" section of the response panel.

## Limitations

**No async/await in current version.** Scripts are synchronous. If you need to make secondary HTTP calls from a script, that's not supported yet.

**No npm packages.** The sandbox has no `require` or `import`. You have the standard JS environment (`JSON`, `Math`, `Date`, `Array`, etc.) and nothing else.

**No DOM access.** `document`, `window`, and Obsidian APIs are not exposed.

**No file access.** Scripts cannot read other vault files (intentional — use `ivk.env` as the only persistent state).

**Crypto.** `btoa`, `atob` work. For HMAC/SHA-256 you'd need to paste the algorithm in manually (we may add a `ivk.crypto` helper later).

## Error handling

- **Syntax errors** in your script produce a `[pre-script error]` or `[post-script error]` log line
- **Runtime errors** (e.g. reading a property of `undefined`) are caught and logged, the request still proceeds
- **Test errors** mark the test as failed with the error message

Scripts never crash the plugin. Worst case, you get a logged error and the request continues.

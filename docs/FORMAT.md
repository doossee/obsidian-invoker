# `.ivk` File Format Specification

> Version: 0.1 (subject to change before 1.0)

## Design principles

- **Plain text** — human-readable, git-diff-friendly
- **AI-generatable** — simple enough that an LLM can produce valid files with zero examples
- **Minimal** — the simplest valid file is one line: `GET https://example.com`
- **Extensible** — `@directives` allow forward-compatible additions
- **Paste-friendly** — body is raw, copy from Bruno/Postman/curl works

## Structure

A `.ivk` file has up to seven sections, in this order:

1. **Directives** — lines starting with `@key value`
2. **Request line** — `METHOD URL` (required)
3. **Headers** — `Key: Value` pairs (optional)
4. **Body** — raw content (optional)
5. **Pre-request script** — `> pre { ... }` (optional)
6. **Post-response script** — `> post { ... }` (optional)
7. **Test script** — `> test { ... }` (optional)

Each section is separated by the transition to the next section's syntax — no explicit delimiters except for script blocks.

## Minimal file

```
GET https://httpbin.org/get
```

## Full example

```
@name Login
@description Send OTP to phone number
@auth bearer {{sessionSecret}}
@timeout 30s
@tag auth

POST {{baseUrl}}/api
Content-Type: application/json
accept-language: en

{
  "jsonrpc": "2.0",
  "method": "Auth.login",
  "params": { "phone": "{{phone}}" }
}

> pre {
  ivk.env.set("reqTime", Date.now());
}

> post {
  ivk.env.set("user_id", res.body.result.user_id);
  ivk.env.set("otp_id", res.body.result.otp_id);
}

> test {
  test("returns user_id", () => {
    expect(res.status).toBe(200);
    expect(res.body.result.user_id).toBeDefined();
  });
}
```

## Directives

Lines at the top of a file starting with `@`. Format: `@key value` (one per line).

| Directive | Example | Meaning |
|---|---|---|
| `@name` | `@name Login` | Display name in UI and tabs |
| `@description` | `@description Send OTP` | Shown in editor and inline embeds |
| `@tag` | `@tag auth` | Group/filter requests |
| `@auth` | `@auth bearer {{token}}` | Auth shorthand — sets `Authorization` header |
| `@auth` | `@auth basic user pass` | Basic auth (user + pass) |
| `@auth` | `@auth none` | Explicitly no auth |
| `@timeout` | `@timeout 30s` | Request timeout (`30s`, `500ms`) |
| `@body` | `@body form-data` | Body type override (forces form-data renderer) |

Unknown directives are ignored (forward-compatibility). You can add your own metadata like `@owner`, `@slo`, etc. — the plugin won't complain, and they'll be preserved on save.

## Request line

Format: `METHOD URL`

- `METHOD` — one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (case-sensitive, uppercase)
- `URL` — any string, may contain `{{variables}}`

The URL is not validated at parse time — variables resolve at send time. If a variable is undefined, the literal `{{name}}` is sent (intentional: fail visibly).

## Headers

Standard `Key: Value` format. Each header on its own line. Header names are case-insensitive on the wire (HTTP spec) but stored as written.

```
Content-Type: application/json
Accept-Language: en
x-custom-header: {{customValue}}
```

Headers end at the first empty line.

## Body

Any content after the empty line that follows the headers is treated as the body, until a `>` script block or EOF.

The format is **not validated** by the parser — it's treated as a raw string. The plugin uses the `Content-Type` header (or `@body` directive) to decide how to display it:

- `application/json` → JSON syntax highlighting + Format button
- `application/xml`, `text/xml` → XML highlighting
- `text/plain`, `text/csv` → plain text
- `@body form-data` → renders a key-value table editor instead of raw text

Examples of valid bodies:

```json
{
  "key": "value"
}
```

```xml
<request>
  <name>{{name}}</name>
</request>
```

```
name=ali&phone={{phone}}
```

```
@body form-data

avatar: @file(./avatar.png)
name: profile_image
```

## Scripts

Three script blocks are supported:

- `> pre { ... }` — runs before the request is sent
- `> post { ... }` — runs after a response is received
- `> test { ... }` — assertions on the response

Each is optional. Order must be: pre → post → test.

Inside the braces: **JavaScript** code. Braces are counted, so nested `{}` in the script body work correctly.

See [`SCRIPTING.md`](SCRIPTING.md) for the full API.

## Variables

Syntax: `{{variableName}}`

Resolved at send time (not parse time). Resolution order:

1. **Runtime** — set by `> pre` scripts in the current request
2. **Active environment** — from the environment selector
3. **Collection** — inherited from `collection.ivk` (future)

Undefined variables stay literal: `{{undefinedName}}` is sent as-is. No silent empty strings.

Variables work in:

- URL
- Header values
- Body (including inside JSON strings)
- `@directive` values (e.g. `@auth bearer {{token}}`)

## Collection files

A `collection.ivk` file in a folder provides defaults for all requests in that folder. (Inheritance is designed; see [`ARCHITECTURE.md`](ARCHITECTURE.md) for implementation status.)

```
@name OVI Platform
@description OVI healthcare API

> pre {
  ivk.request.headers["Content-Type"] = "application/json";
}
```

## Edge cases

**Empty file**
Parser accepts empty files; the editor opens with default values (`GET`, empty URL).

**Method-only line**
`GET` without a URL is valid — URL defaults to empty string.

**URL-only line**
A line starting with `http://` or `https://` without a method is treated as `GET URL`.

**Body containing `>`**
If your body starts with `>` (e.g. a JSON object serialization), add any leading whitespace to disambiguate from a script marker. Script markers match `^> (pre|post|test) {` exactly.

**Nested braces in scripts**
```javascript
> post {
  if (res.status === 200) {
    ivk.env.set("ok", "true");
  }
}
```
The parser counts brace depth — this works fine.

## Forward compatibility

We reserve the right to add:

- New `@directives`
- New script blocks (e.g. `> setup`, `> cleanup`)
- New body type overrides

Existing parsers should ignore anything they don't recognize. Serialization preserves unknown directives so round-trips are lossless.

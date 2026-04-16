<div align="center">

# ⚡ Invoker

**A Bruno-like API client for Obsidian.**
Create, run, and document HTTP requests with the `.ivk` file format — right inside your vault.

[![Release](https://img.shields.io/github/v/release/doossee/obsidian-invoker?style=flat-square&color=blue)](https://github.com/doossee/obsidian-invoker/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.0%2B-purple?style=flat-square&logo=obsidian)](https://obsidian.md)
[![Made with TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/doossee/obsidian-invoker/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/doossee/obsidian-invoker/actions)

</div>

---

## Why Invoker?

You already keep your notes in Obsidian. Your API documentation probably lives there too. **Invoker turns those docs into a runnable API client** — no more jumping between Postman, Bruno, and your docs. Write a request in a `.ivk` file, hit Send, get a response. Embed the same request inline inside a markdown doc and let your team run it with one click.

## Features

- 📮 **Full-featured request editor** — method, URL, headers, body, auth, scripts
- 📁 **`.ivk` file format** — plain text, git-friendly, AI-friendly
- 🌍 **Environments & variables** — `{{baseUrl}}`, `{{sessionSecret}}` resolved at send time
- 📝 **Pre/post/test scripts** — sandboxed JavaScript with `ivk` and `res` globals
- 🔗 **Chain requests** — save values from one response, use them in the next
- 🎨 **Syntax highlighting** — JSON, JavaScript, and `{{variable}}` highlighting
- ⚙️ **Inline markdown embedding** — `ivk` code blocks with Run button in your docs
- 🔐 **Auth shorthands** — `@auth bearer {{token}}`, `@auth basic user pass`
- 🧪 **Built-in testing** — `test()` / `expect()` assertions on responses
- 📡 **Uses Obsidian's HTTP client** — bypasses CORS, works in desktop and mobile

## Install

### From Obsidian Community Plugins (coming soon)

1. Open Obsidian → **Settings** → **Community plugins**
2. Click **Browse** and search for "Invoker"
3. Click **Install**, then **Enable**

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/doossee/obsidian-invoker/releases/latest)
2. Create a folder `.obsidian/plugins/invoker/` in your vault
3. Drop the three files in that folder
4. Reload Obsidian, then enable the plugin in Settings

### From source

```bash
git clone https://github.com/doossee/obsidian-invoker.git
cd obsidian-invoker
npm install
npm run build
# Copy main.js, manifest.json, styles.css to .obsidian/plugins/invoker/
```

## Quick start

### 1. Create a request

Create a new file `hello.ivk`:

```
@name Hello World

GET https://httpbin.org/get
Accept: application/json
```

Open it — the visual editor renders. Click **Send**.

### 2. Use variables

Set up an environment in **Settings → Invoker**:

| Variable  | Value                 |
| --------- | --------------------- |
| `baseUrl` | `https://httpbin.org` |

Your request now works across environments:

```
@name Hello World

GET {{baseUrl}}/get
```

### 3. Chain requests with scripts

```
@name Login

POST {{baseUrl}}/api/login
Content-Type: application/json

{
  "email": "{{email}}",
  "password": "{{password}}"
}

> post {
  ivk.env.set("token", res.body.access_token);
}
```

Now any other `.ivk` file can use `@auth bearer {{token}}` and it just works.

### 4. Embed in markdown docs

In any `.md` file, add:

````markdown
## Login

Before calling protected endpoints, get a session token:

```ivk
path: api/login.ivk
show: full
```
````

You get a runnable widget inline in your docs. One source of truth for docs + testing.

## The `.ivk` format

```
@name Login
@description Send OTP to phone number
@auth bearer {{sessionSecret}}
@timeout 30s
@tag auth

POST {{baseUrl}}/api/login
Content-Type: application/json

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
}

> test {
  test("returns user_id", () => {
    expect(res.status).toBe(200);
    expect(res.body.result.user_id).toBeDefined();
  });
}
```

**Sections (in order):**

1. `@directives` — metadata (name, auth, timeout, description, tag, body)
2. `METHOD URL` — required, e.g. `POST https://api.example.com`
3. `Key: Value` headers — until empty line
4. Raw body — any format (JSON, XML, form-data, plain text)
5. `> pre { }` — pre-request script (optional)
6. `> post { }` — post-response script (optional)
7. `> test { }` — test assertions (optional)

Minimal file is one line: `GET https://api.example.com/health`

See [FORMAT.md](docs/FORMAT.md) for the full specification.

## Scripting API

Pre-request script has access to `ivk.request`, `ivk.env`. Post-response has `res` (status, body, headers, time) and `ivk.env`.

```javascript
// Read/write environment variables
ivk.env.get('name');
ivk.env.set('name', 'value');

// Modify the outgoing request (pre only)
ivk.request.headers['X-Custom'] = 'value';
ivk.request.url = '...';
ivk.request.body = '...';

// Read the response (post/test)
res.status; // number
res.body; // parsed object
res.headers; // object
res.time; // ms

// Logging (pre/post/test)
ivk.log('message');

// Tests (test block only)
test('description', () => {
  expect(value).toBe(expected);
  expect(value).toBeDefined();
  expect(value).toContain(sub);
  expect(value).toBeGreaterThan(n);
});
```

## Documentation

- [`docs/FORMAT.md`](docs/FORMAT.md) — complete `.ivk` format spec
- [`docs/SCRIPTING.md`](docs/SCRIPTING.md) — scripting API reference
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the plugin is structured
- [`CHANGELOG.md`](CHANGELOG.md) — release history

## Contributing

Contributions welcome! See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## Support

- 🐛 [Report a bug](https://github.com/doossee/obsidian-invoker/issues/new?template=bug_report.md)
- 💡 [Request a feature](https://github.com/doossee/obsidian-invoker/issues/new?template=feature_request.md)
- 💬 [Discussions](https://github.com/doossee/obsidian-invoker/discussions)
- ❤️ [Sponsor](https://github.com/sponsors/doossee)

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

Built for <a href="https://obsidian.md">Obsidian</a>. Inspired by <a href="https://www.usebruno.com/">Bruno</a>.

</div>

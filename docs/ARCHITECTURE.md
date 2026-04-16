# Architecture

High-level overview of how Invoker is structured and how the pieces fit together.

## System diagram

```
                      ┌──────────────────────┐
                      │  main.ts             │
                      │  (plugin entry)      │
                      └──────────┬───────────┘
                                 │
             ┌───────────────────┼───────────────────┐
             │                   │                   │
     ┌───────▼───────┐  ┌────────▼────────┐  ┌──────▼────────┐
     │ RequestView   │  │ Inline Widget   │  │ Settings Tab  │
     │ (ItemView)    │  │ (MD processor)  │  │               │
     └───────┬───────┘  └────────┬────────┘  └───────────────┘
             │                   │
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │  RequestRunner    │
             │  (HTTP + scripts) │
             └─────────┬─────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│ IvkParser   │ │ ScriptRunner│ │ EnvManager │
│ (file format)│ │ (sandbox)   │ │ (variables)│
└─────────────┘ └─────────────┘ └────────────┘
```

## Responsibilities

| Module | Responsibility |
|---|---|
| `main.ts` | Plugin lifecycle, registration of view/processor/settings, status bar, commands |
| `parser/ivk-parser.ts` | Parse and serialize `.ivk` files. Pure functions, no side effects |
| `env/env-manager.ts` | Resolve `{{variables}}`, manage runtime/env/collection scope |
| `runner/script-runner.ts` | Execute pre/post/test scripts in a sandbox, collect logs and test results |
| `runner/request-runner.ts` | Variable resolution, invoke `requestUrl`, orchestrate scripts |
| `views/request-view.ts` | Visual editor — top bar, tabs, body editor, response panel |
| `widgets/inline-widget.ts` | `ivk` markdown code block → runnable inline widget |
| `settings/settings-tab.ts` | Obsidian settings panel for environment management |

## Data flow: running a request

```
1. User clicks Send in RequestView
2. RequestView → RequestRunner.run(request)
3. RequestRunner clones the request (so UI state isn't mutated)
4. RequestRunner → EnvManager.resolveVariables() for url, body, headers
5. RequestRunner → ScriptRunner.runPreScript() — may mutate cloned request
6. RequestRunner → requestUrl() (Obsidian HTTP API, bypasses CORS)
7. Response comes back
8. RequestRunner → ScriptRunner.runPostScript(response) — may set env vars
9. RequestRunner → ScriptRunner.runTests(response) — produces test results
10. Returns { response, testResults, logs } to RequestView
11. RequestView renders the response panel
```

## The `.ivk` format

Parsed into an `IvkRequest`:

```typescript
interface IvkRequest {
  directives: Record<string, string>;   // @name, @auth, @tag, etc.
  method: HttpMethod;                    // GET | POST | PUT | PATCH | DELETE
  url: string;                           // may contain {{variables}}
  headers: Record<string, string>;
  body: string;                          // raw, any format
  scripts: {
    pre: string;                         // JS source
    post: string;
    test: string;
  };
}
```

The parser is a simple state machine:

```
directives → request-line → headers → body → script
```

Each `>` block transitions into script mode, then back to body after the closing `}`.

See [`FORMAT.md`](FORMAT.md) for the full specification.

## Variable resolution

`EnvManager.get(name)` resolves in priority order:

1. **Runtime** — values set by `> pre` scripts during current request (highest priority)
2. **Active environment** — variables defined in the selected environment
3. **Collection** — variables inherited from a `collection.ivk` file (future)

Undefined variables are left as literal `{{variableName}}` in the output. This is intentional — we'd rather fail visibly than silently send a bad request.

## Script sandbox

Scripts run via `new Function()`, not `eval`. They receive:

- **`ivk`** — `{ env, request, log }` for pre; `{ env, log }` for post/test
- **`res`** — response object (post and test only)
- **`test`, `expect`** — test harness (test block only)

The sandbox is intentionally limited but **not a security boundary**. See [`SECURITY.md`](../SECURITY.md).

## Persistence

- **Settings** — Obsidian's `loadData()` / `saveData()` → `.obsidian/plugins/invoker/data.json`
- **`.ivk` files** — plain text on disk, parsed on view open
- **Environment variables** — persisted to `data.json` via settings tab, runtime values also written back on `ivk.env.set()`

## Extension points

Want to extend Invoker? Common additions:

**New `@directive`**
- Add handling in `parser/ivk-parser.ts` (`auth` directive is the model)
- Consume in `runner/request-runner.ts` (e.g. `@timeout` sets request timeout)
- Optionally expose in `views/request-view.ts` (Params tab)

**New language for syntax highlighting**
- Add a case to `highlightCode()` in `views/request-view.ts`
- Content-type detection in `renderBodyTab()` decides which language to use

**New scripting API global**
- Add to the `ivk` object in `runner/script-runner.ts`
- Document in `docs/SCRIPTING.md`

**New body type (form-data, binary, etc.)**
- Detect via `Content-Type` header or `@body` directive
- Override body rendering in `renderBodyTab()`
- Transform body in `RequestRunner.run()` before calling `requestUrl()`

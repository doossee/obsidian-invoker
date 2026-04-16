# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-04-16

### Changed

- **Internal refactor:** parser, env manager, script runner, and request runner extracted into the standalone [`ivkjs`](https://github.com/doossee/ivkjs) npm package. No user-visible behavior change.
- Added `ObsidianTransport` — a thin wrapper around `requestUrl()` implementing the `ivkjs` `HttpTransport` interface.

### Removed

- `src/parser/`, `src/env/`, `src/runner/` — moved to `ivkjs`. Plugin consumes them via `import from 'ivkjs'`.

[0.2.0]: https://github.com/doossee/obsidian-invoker/releases/tag/0.2.0

## [0.1.0] — 2026-04-16

### Added

- Initial release 🎉
- `.ivk` file format with parser and serializer
- Custom file view for `.ivk` files — Bruno-like editor UI
  - Method dropdown, URL input, Send button
  - Tabs: Headers, Body, Auth, Scripts, Params
  - Response panel with status, headers, tests, console logs
- Environment manager with multi-environment support
- Variable resolution (`{{variableName}}`) with priority: runtime > active env > collection
- Pre-request, post-response, and test scripts (sandboxed JS)
- Scripting API: `ivk.env.get/set`, `ivk.request.*`, `res.*`, `ivk.log`
- Test assertions: `test()`, `expect().toBe/toBeDefined/toContain/toBeGreaterThan`
- Syntax highlighting for JSON body and JS scripts (overlay approach)
- Variable autocomplete on `{{`
- Tab indentation in body and script editors
- "Format JSON" button
- Inline markdown embedding via `ivk` code blocks
- Three display modes: `compact`, `full`, `response`
- Settings tab for environment management with import/export
- Status bar with active environment indicator
- Command: Switch active environment
- Command: Create new `.ivk` request
- Auth shorthands: `@auth bearer {{token}}`, `@auth basic user pass`, `@auth none`
- Collection support (folder-level `collection.ivk`)

[Unreleased]: https://github.com/doossee/obsidian-invoker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/doossee/obsidian-invoker/releases/tag/v0.1.0

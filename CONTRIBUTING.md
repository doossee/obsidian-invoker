# Contributing to Invoker

Thanks for your interest in improving Invoker! This doc covers how to set up a dev environment, our code style, and the PR process.

## Development setup

**Prerequisites:** Node.js 20+, Obsidian for testing.

```bash
git clone https://github.com/doossee/obsidian-invoker.git
cd obsidian-invoker
npm install
```

**Link the plugin to a test vault:**

```bash
# From the plugin directory
ln -s "$(pwd)" /path/to/your/test-vault/.obsidian/plugins/invoker
```

**Watch mode:**

```bash
npm run dev
```

This rebuilds `main.js` on every change. In Obsidian, use the `Reload app without saving` command (or Cmd/Ctrl+R) after edits.

**Production build:**

```bash
npm run build
```

## Branching model

- **`main`** — always stable, deployable. Only merged from PRs that pass CI.
- **`develop`** — integration branch for in-flight work (optional, for larger features).
- **Feature branches** — `feat/<short-topic>`, `fix/<short-topic>`, `docs/<short-topic>`, `refactor/<short-topic>`.

Branch from `main` for small changes, from `develop` for larger features that need integration time.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for form-data body type
fix: correct variable resolution in nested scripts
docs: clarify scripting API in README
refactor: extract parser into separate module
chore: bump typescript to 5.7.2
test: add coverage for environment manager
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`, `ci`.

Keep the first line under 70 chars. Use the body (after a blank line) for details if needed.

## Pull requests

1. **Fork & branch** from `main`
2. **Make your change** — small, focused PRs merge faster
3. **Run lint and build** locally:
   ```bash
   npm run lint
   npm run build
   ```
4. **Write a clear PR description** — what, why, how to test
5. **Link the issue** if it fixes one (`Closes #42`)
6. **Wait for CI** to pass
7. **Address review feedback** — push new commits, no need to force-push

Small typo fixes, dependency bumps, and doc corrections are welcome without a prior issue. For larger features, open an issue first to discuss the approach.

## Code style

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Prettier** — run `npm run format` before committing
- **ESLint** — run `npm run lint`, fix with `npm run lint:fix`
- **2-space indentation**, single quotes, trailing commas
- **Explicit return types** on exported functions
- **Functional style preferred** over class hierarchies where it fits

## Project structure

```
src/
├── main.ts              ← plugin entry point
├── types.ts             ← shared interfaces
├── parser/              ← .ivk parser and serializer
├── env/                 ← environment & variable manager
├── runner/              ← HTTP execution + script sandbox
├── views/               ← visual editor view (ItemView)
├── widgets/             ← markdown code block renderer
└── settings/            ← plugin settings panel
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for more detail on how the pieces fit together.

## Testing changes manually

1. `npm run build`
2. Reload Obsidian
3. Open a `.ivk` file, test your change
4. Verify the response panel renders correctly
5. Test variable resolution, scripts, and inline widgets

## Releasing (maintainers)

```bash
# Bump version (updates manifest.json and versions.json)
npm version patch   # or minor, major

# Push commits + tag
git push
git push --tags
```

The `release.yml` workflow auto-builds and creates a GitHub release with `main.js`, `manifest.json`, and `styles.css` attached.

## Code of conduct

See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). TL;DR: be kind, stay on-topic, assume good faith.

## Questions?

Open a [discussion](https://github.com/doossee/obsidian-invoker/discussions) or drop a comment on an issue.

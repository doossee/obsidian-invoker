# Security Policy

## Supported versions

Only the latest released version receives security patches.

| Version | Supported |
| ------- | --------- |
| Latest  | ✅        |
| Older   | ❌        |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, use GitHub's [private vulnerability reporting](https://github.com/doossee/obsidian-invoker/security/advisories/new) feature, or email the maintainer directly at the address listed on the [author's GitHub profile](https://github.com/doossee).

Please include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You should receive an initial response within 7 days. If the vulnerability is confirmed, we'll work on a fix and coordinate a disclosure timeline.

## Scope

Invoker executes pre-request and post-response **scripts** in a sandboxed `Function` context. The sandbox is intentionally limited but **not a security boundary** — users should only run scripts from `.ivk` files they trust, just like they would for any other code they execute.

Specifically:

- `.ivk` files can make arbitrary HTTP requests to any URL
- Scripts have access to `localStorage` via the Obsidian API
- Scripts cannot read other vault files directly, but can exfiltrate data via HTTP requests

Treat `.ivk` files from untrusted sources with the same caution you would treat any executable script.

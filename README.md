# Obsidian Plugin Agent Kit

Rules and tooling for building Obsidian plugins with a coding agent, and getting them through
the Community directory review.

Two things live here:

- **[`OBSIDIAN_PLUGIN_DEVELOPMENT_RULES.md`](OBSIDIAN_PLUGIN_DEVELOPMENT_RULES.md)** — the rules
  an agent should follow while writing an Obsidian plugin: project structure, deprecated APIs and
  their replacements, security rules, lifecycle management, UI conventions, accessibility, and a
  submission checklist.
- **[`skills/audit-obsidian-plugin/`](skills/audit-obsidian-plugin/)** — a Claude Code skill that
  audits a plugin against those rules and the official policies, reports findings by severity,
  auto-fixes the mechanical ones, and can drive a real Obsidian to verify runtime behaviour and
  record README demos.

## Why

Static checks catch a lot, but a plugin can typecheck, lint clean, pass its tests, and still ship
a feature that has never once rendered. That happens when a guard tests an undocumented Obsidian
internal that no longer exists: the block is skipped forever, silently, and a hand-written `.d.ts`
keeps the compiler happy. The only way to find it is to run the thing.

So the skill covers both halves — the static audit, and actually driving Obsidian.

## Install the skill

Copy it into your skills directory:

```bash
# Personal, available in every project
cp -r skills/audit-obsidian-plugin ~/.claude/skills/

# Or per project
cp -r skills/audit-obsidian-plugin .claude/skills/
```

Then ask Claude to audit, review or check your plugin, or invoke it by name.

### Configure your identity (optional)

The BMC/funding rules reference `<AUTHOR_HANDLE>` and `<FUNDING_HANDLE>`. Copy
`skills/audit-obsidian-plugin/identity.example.json` to `identity.json` and fill it in so the
audit knows which handles are correct for you. Leave `fundingHandle` empty if you do not take
donations — the funding checks are then skipped rather than reported as failures.

## What the audit covers

Findings are grouped by severity: **BLOCKER** (rejected or removed), **MAJOR** (a reviewer will
ask), **MINOR** (style), **PERF**, **DEBT**.

| Area | Examples |
| --- | --- |
| Manifest and naming | id/name/description rules, `minAppVersion`, `isDesktopOnly`, `versions.json` |
| Security | `innerHTML`, `eval`, remote code, `fetch` instead of `requestUrl` |
| API misuse | `process.platform`, hardcoded `.obsidian`, casting instead of `instanceof`, regex lookbehind |
| Lifecycle | unregistered events and intervals, cleanup on unload |
| UI/UX | sentence case, inline styles, hardcoded colours, accessibility |
| Performance | work while idle, full re-renders, N+1 over the vault |
| **Policy** | installing dependencies, missing network and file-access disclosures |
| **Runtime-only** | dead guards on internals, modal promises that never settle, DOM left behind on unload |

## Two things worth knowing before you submit

**The submission process changed in 2026.** Plugins are no longer submitted by opening a pull
request against `obsidianmd/obsidian-releases`. That repository is now a read-only registry.
Submission happens at [community.obsidian.md](https://community.obsidian.md) with an Obsidian
account linked to your GitHub account, and the directory reads `manifest.json` from your default
branch HEAD. A lot of guidance still describes the old flow.

**A plugin must not install its own dependencies.** The developer policies forbid a plugin from
installing "themselves or their dependencies", which includes downloading a helper binary or CLI
at runtime — pinning the version and verifying a checksum makes it safe, not permitted. Every
comparable plugin currently in the directory (pandoc, ffmpeg, git) relies on a binary the user
installed. [`reference/submission-process.md`](skills/audit-obsidian-plugin/reference/submission-process.md)
has the policy text and how to check what the directory has actually approved.

## Recording README demos

`skills/audit-obsidian-plugin/scripts/demo-capture/` drives a real Obsidian over the Electron
remote debugging protocol and turns UI states into GIFs. No dependencies: Node 22+ has a global
`WebSocket`, so the CDP client is about a hundred lines, and Pillow encodes the GIF.

```bash
PLUGIN_DIR=/path/to/your/plugin node scripts/demo-capture/setup-demo.mjs
```

It uses an isolated `--user-data-dir`, so your real vault list, plugins and settings are never
touched.

The one trap worth reading about first: Obsidian routes modals and notices through its own
`activeWindow`/`activeDocument` globals for pop-out support. While the window is unfocused those
point elsewhere, and **everything you open lands in a document you are not looking at — no error,
no exception, nothing visible.** It looks exactly like a broken plugin.
[`reference/demo-capture.md`](skills/audit-obsidian-plugin/reference/demo-capture.md) explains the
fix and why the obvious version of it does not work.

## Status

The rules and the audit reflect the Obsidian developer policies and submission requirements as of
**September 2026**, verified against the official docs sources rather than secondary guides.
Obsidian is iterating on plugin review, so check
[docs.obsidian.md](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) if something
here looks stale — and please open an issue.

## License

MIT. See [LICENSE](LICENSE).

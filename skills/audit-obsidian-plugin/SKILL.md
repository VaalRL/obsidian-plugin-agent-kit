---
name: audit-obsidian-plugin
description: Audit an Obsidian plugin against the Obsidian developer policies, the submission requirements for the Community directory, and plugin-security / performance anti-patterns. Reports violations by severity and can auto-fix most of them after approval. Also covers releasing: the community.obsidian.md submission process, the policy on installing dependencies, release-tag and leaked-secret traps, and driving a real Obsidian over the debugging protocol to verify runtime behaviour and record README screenshots and demo GIFs. Use when preparing an Obsidian plugin for submission or release, when responding to review feedback, when recording plugin demos, or whenever the user asks to "review", "audit", "lint", or "check" an Obsidian plugin.
version: 2.0.0
author: Claude Code
category: obsidian
---

# Audit Obsidian Plugin

Mechanical review of an Obsidian plugin against the official submission rules, ObsidianReviewBot feedback patterns, and Electron-specific performance/memory anti-patterns. Produces a categorized findings report and can apply safe auto-fixes.

## When to invoke

- Before submitting to the Obsidian Community directory at community.obsidian.md
- When preparing a release, or recording README screenshots and demo GIFs
- Responding to ObsidianReviewBot comments on an existing PR
- After finishing a large feature, before merging
- When the user asks to "review", "audit", "lint", or "check" an Obsidian plugin
- When the user mentions tech debt, memory leaks, or performance issues in an Obsidian plugin

## Workflow

Run phases in order. Do not skip phases. Each phase writes findings to the running report.

### Phase 0 — Scope discovery

1. Locate `manifest.json` at repo root. If missing, stop and tell the user this is not an Obsidian plugin root.
2. Read `manifest.json`, `package.json`, `tsconfig.json`, `versions.json`, `styles.css`, `.gitignore`, `LICENSE`.
3. Note the source roots (`main.ts`, `src/`), the build output paths, and whether tests exist.
4. Announce in one sentence what will be audited.

### Phase 1 — Run checks in parallel

Use `Grep` for each rule in [reference/rule-catalog.md](./reference/rule-catalog.md). Group grep calls in parallel batches of ~10 to avoid serialization. Do NOT use `cat`, `find`, or `ls` — use `Grep`, `Glob`, `Read`.

Scan only source files: `main.ts`, `src/**/*.ts`, `src/**/*.tsx`. Ignore `node_modules/`, `main.js`, `dist/`, `build/`, `Test Vault/`.

For each rule that matches, record: rule code, severity, file:line, snippet, suggested fix. Count matches but cap reported instances per rule at 20 (note "+N more" if truncated).

### Phase 2 — Severity ranking

- **BLOCKER** — will fail the submission PR bot (manifest, id/name rules, innerHTML, var, process.platform, fetch-for-CORS, remote code eval, missing LICENSE).
- **MAJOR** — will get requested fixes from human reviewer (inline styles, `console.log`, `any`, floating promises, `detachLeavesOfType` in onunload, heading elements in settings, default hotkeys, casting instead of `instanceof`).
- **MINOR** — style / consistency (sentence case, unused imports, unused vars, tooltip via setAttribute, settings-tab top heading).
- **PERF** — runtime cost (chained `.filter` on large collections, `Promise.all` without batch cap, full re-renders, per-item async in loops, pretty-printed JSON on disk, `Array.from` with no reason).
- **DEBT** — maintainability (files > 300 lines with no module split, duplicated logic, `enhanced_/v2_/new_` naming, copy-pasted blocks).
- **BMC** — Buy Me A Coffee integration (description page, settings page, correct id `<FUNDING_HANDLE>`, no security/perf regressions from the donate widget). Severities mapped per rule in the catalog.

### BMC check (Phase 1 sub-pass)

Canonical identities, from identity.json — the two are DIFFERENT handles:
- Author (GitHub attribution): `<AUTHOR_HANDLE>` → `https://github.com/<AUTHOR_HANDLE>` (used in `manifest.json#author`, `manifest.json#authorUrl`, `package.json#author`, LICENSE copyright).
- BMC (funding): `<FUNDING_HANDLE>` → `https://www.buymeacoffee.com/<FUNDING_HANDLE>` (used in `manifest.json#fundingUrl`, README badge, settings tab support section).

Flag as a violation (MAN-022) if `<FUNDING_HANDLE>` leaks into the `author`/`authorUrl` fields, or if `<AUTHOR_HANDLE>` ends up in a BMC link.

Always run this pass after the main grep pass. It needs to cross-reference three surfaces:

1. `manifest.json` — look for `fundingUrl`; confirm host/path point at `buymeacoffee.com/<FUNDING_HANDLE>`. Also verify `author`=`<AUTHOR_HANDLE>` and `authorUrl`=`https://github.com/<AUTHOR_HANDLE>` (MAN-018..022).
2. `README.md` — look for at least one BMC badge; confirm HTTPS, correct id, `alt`, `width`/`height`, canonical CDN host.
3. Settings tab source (any class extending `PluginSettingTab`) — look for a donate block linking to the same URL; confirm it is built via `createEl` (not `innerHTML`), no runtime script tag, and `rel="noopener noreferrer" target="_blank"` are set.

Run in parallel:
- `Grep pattern="buymeacoffee\.com" glob="**/*.{md,ts,json}"` — presence
- `Grep pattern="buymeacoffee\.com/(?!<FUNDING_HANDLE>\b)[A-Za-z0-9_-]+"` — wrong id (BMC-007)
- `Grep pattern="http://(?:www\.|cdn\.|img\.)?buymeacoffee\.com"` — insecure http (BMC-004)
- `Grep pattern="YOUR_BMC_ID|YOUR_USERNAME|<bmc-id>|example_user"` — leftover placeholder (BMC-008)
- `Grep pattern="buymeacoffee" -C 3` on `**/*.ts` — pull surrounding lines to detect `innerHTML`/script-tag injection and missing rel/target (BMC-010..013)
- `Grep pattern="github\.com/<FUNDING_HANDLE>|\"author\"\s*:\s*\"<FUNDING_HANDLE>\"" glob="**/*.{md,ts,json}"` — detect BMC id leaking into author field (MAN-022)
- `Read manifest.json` — verify `fundingUrl` (BMC-001..002) AND `author`/`authorUrl` (MAN-018..019)
- `Read README.md` — verify badge block, alt/width/height (BMC-003..005, 021, 025)

Then count duplicate BMC url literals across `.ts` files — if more than one file hardcodes the url, raise BMC-023. If more than one file builds a button from scratch, raise BMC-024.

Report BMC findings in a dedicated **BMC** section of the report. If `manifest.json#fundingUrl` is missing AND README has no BMC link AND no settings donate block, emit a single summary line: "BMC: not integrated — user's id `<FUNDING_HANDLE>` not referenced anywhere" with `MAJOR` severity (the user has declared BMC support is expected).

### Phase 2.5 — Submission readiness (only when a submission or release is in view)

Skip for a routine audit. Run it whenever the user mentions submitting, releasing, publishing, or
the community directory.

Read [reference/submission-process.md](./reference/submission-process.md) **before advising on
any of this** — the process changed in 2026 and most guidance, including older copies of this
skill, describes a pull request that is no longer accepted.

Check, in this order:

1. **Does anything here install or download a dependency at runtime?** This is the policy line
   that rejects real plugins. Do not assert it is fatal without checking precedent — the reference
   shows how to query what the directory has actually published.
2. **Are the README disclosures present** for network use, and for reading files outside the
   vault? Both are required by policy and the second is routinely missed.
3. **Is the work on the default branch?** The directory reads `manifest.json` from the default
   branch HEAD.
4. **Does anything call an API newer than `minAppVersion`?** This is the one *error* the scan
   issues. Run `node scripts/check-api-versions.mjs <plugin-root>`.
5. **Is `skipLibCheck` in `tsconfig.json`**, not only on the `tsc` command line? If it is missing,
   an external type-aware lint sees `obsidian.d.ts` fail and reports a flood of phantom
   `no-unsafe-*` warnings. Reproduce any such warnings locally before touching the code.
6. **Is a lockfile committed**, and does CI use `npm ci`?
7. **Will `npm version` produce the right tag?** Check `npm config get tag-version-prefix`; it
   must be empty, not `v`.
8. **Has a credential ever been committed?** Scan the whole history, not the working tree.

Report what the user has to do themselves: the final submission is a web form behind an Obsidian
account login and cannot be automated.

### Phase 2.6 — Live verification and demo capture (on request, or when claims are unverified)

Read [reference/demo-capture.md](./reference/demo-capture.md); working scripts are in
[scripts/demo-capture/](./scripts/demo-capture/).

Run this when the user asks for README GIFs or screenshots, or when a checklist asserts behaviour
nobody has observed. Driving the real plugin finds defects that static analysis structurally
cannot — a guard on a no-longer-existent internal, a modal promise that never settles, DOM left
behind on unload. Treat "it typechecks and the tests pass" as no evidence at all about runtime UI.

Capture one screenshot per UI state with its own duration rather than recording video, and
composite the cursor afterwards — screenshots contain no pointer. Whatever the README asserts,
measure it in the same run.

### Phase 3 — Report

Write a concise Markdown report. Do NOT save it to disk unless the user asks. Structure:

```
## Obsidian Plugin Audit — <plugin-id> @ <version>

### Summary
- BLOCKER: N  MAJOR: N  MINOR: N  PERF: N  DEBT: N

### BLOCKER
- [RULE-ID] short rule name — file:line — snippet
  fix: one-line remedy

### MAJOR
...
(etc.)

### Auto-fixable
List of rule IDs that can be auto-fixed mechanically.

### Needs human decision
List of findings requiring judgment.
```

### Phase 4 — Ask before fixing

After the report, ask the user:
> "Apply auto-fixes for the following rule IDs? [list]. Anything else to include or exclude?"

Do NOT start fixing until the user confirms. If the user says "fix everything", fix the auto-fixable set; leave judgment calls for a follow-up.

### Phase 5 — Apply fixes

Use `Edit` / `Write` per [reference/auto-fixes.md](./reference/auto-fixes.md). After each batch:

- Run `npm run build` (or `tsc --noEmit`) if available, to catch type regressions.
- If the build fails, revert the last batch and surface the error to the user.
- Do not amend prior commits; create a new commit per logical fix batch only if the user explicitly asks.

### Phase 6 — Re-audit and follow-up

Re-run Phase 1 over the changed files only. Confirm counts dropped. Spawn in parallel per the project's `CLAUDE.md` §11 agent collaboration rule:
- `security-auditor` — review remaining security-sensitive edits
- `ux-improvement-analyst` — review UI copy / sentence case fixes
- `code-reviewer` — final code pass
- `test-automator` — update or add tests for changed behavior

## Rule reference

All rule codes used in the report are defined in:

- [reference/rule-catalog.md](./reference/rule-catalog.md) — every rule, its grep pattern, and severity
- [reference/auto-fixes.md](./reference/auto-fixes.md) — mechanical fix recipes
- [reference/review-bot-patterns.md](./reference/review-bot-patterns.md) — exact ObsidianReviewBot phrasing so findings match what the bot would say
- [reference/submission-process.md](./reference/submission-process.md) — the current submission process, the developer policies, how to check precedent, and the release traps (tag prefix, secrets in history)
- [reference/demo-capture.md](./reference/demo-capture.md) — driving Obsidian over the debugging protocol, capturing README GIFs, and the runtime-only defects that only this finds

## Non-goals

- Do NOT rewrite architecture. Flag debt; let the user decide scope.
- Do NOT change behavior. Auto-fixes are mechanical substitutions only.
- Do NOT create new documentation files (per project CLAUDE.md).
- Do NOT run destructive git operations. No force-push, no `--amend`, no branch deletion.

## Running under memory pressure

This repo's `CLAUDE.md` warns about Obsidian/Electron memory. When scanning:
- Prefer `Grep output_mode="count"` first to size the problem before loading snippets.
- Cap `head_limit` at 50 per grep.
- Don't `Read` the whole `main.js` bundle — it is generated and will not be audited.

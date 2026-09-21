# Rule Catalog

Every rule the audit checks, grouped by the phase of review where it is caught. Severity legend:

- **BLOCKER** — automated PR bot (`ObsidianReviewBot`) will block the release PR.
- **MAJOR** — human reviewer will request changes before approval.
- **MINOR** — style / consistency; often skippable via `/skip` bot comment.
- **PERF** — runtime cost; not enforced by the bot but hurts users on large vaults or mobile.
- **DEBT** — maintainability; not enforced but drives rework cost.

Each rule lists a grep pattern (ripgrep syntax, single line unless `multiline: true` noted) and a fix hint. Use `Grep` with `path="."`, `type="ts"`, `glob="!{node_modules,dist,build,Test Vault,main.js}/**"`.

---

## A. Manifest, naming, and submission (BLOCKER)

| ID | Rule | Check |
|---|---|---|
| MAN-001 | `manifest.json` `id` must be lowercase, no spaces | Read & parse |
| MAN-002 | `id` must not contain `"obsidian"` | Read & parse |
| MAN-003 | `id` must not end with `"plugin"` | Read & parse |
| MAN-004 | `name` must not contain `"Obsidian"` | Read & parse |
| MAN-005 | `name` must not start with `"Obsi"` or end with `"dian"` | Read & parse |
| MAN-006 | `name` must not end with `"Plugin"` | Read & parse |
| MAN-007 | `description` must not contain `"Obsidian"` | Read & parse |
| MAN-008 | `description` must not start with `"This plugin"` | Read & parse |
| MAN-009 | `description` must end with `.`, `?`, `!`, or `)` | Read & parse |
| MAN-010 | `version` must be SemVer (`x.y.z`), no leading `v` | Read & parse |
| MAN-011 | `minAppVersion` present | Read & parse |
| MAN-012 | `isDesktopOnly` present and correct | Read & parse; if false, run MOB-* |
| MAN-013 | `versions.json` contains entry for current version | Read & parse |
| MAN-014 | `main.js` NOT committed to repo | `Glob "main.js"` at root + not in `.gitignore` ⇒ violation |
| MAN-015 | `LICENSE` file present at repo root | `Glob "LICENSE*"` |
| MAN-016 | `README.md` present | `Glob "README.md"` |
| MAN-017 | `manifest.json` description matches GitHub repo description byte-for-byte | Needs user confirmation |
| MAN-023 | Description contains **no emoji or special characters** (explicit submission requirement) | Read & parse |
| MAN-024 | `manifest.json` on the **default branch HEAD** is the final one — the directory reads it from there, not from a feature branch | `git show <default>:manifest.json` |
| MAN-025 | `npm config get tag-version-prefix` is empty, not `v` — otherwise `npm version` tags `v1.0.0`, which the directory rejects | Add `.npmrc` with `tag-version-prefix=""` |
| MAN-026 | No credential anywhere in **git history**, not just the working tree — and note that force-pushing does not remove it from GitHub | See submission-process.md |
| MAN-018 | `manifest.json#author` equals the canonical author handle `<AUTHOR_HANDLE>` | Read & parse |
| MAN-019 | `manifest.json#authorUrl` equals `https://github.com/<AUTHOR_HANDLE>` (HTTPS, exact handle, no trailing slash) | Read & parse |
| MAN-020 | `package.json#author` equals `<AUTHOR_HANDLE>` (or `"<AUTHOR_HANDLE> <...>"` form) | Read & parse |
| MAN-021 | `LICENSE` copyright line references `<AUTHOR_HANDLE>` (not a prior handle, placeholder, or BMC id `<FUNDING_HANDLE>`) | Read & grep `Copyright \(c\) \d{4}\s+<AUTHOR_HANDLE>` |
| MAN-022 | Author identity must NOT be `<FUNDING_HANDLE>` — that handle is the BMC/funding id, not the GitHub/author attribution | Grep `"author"\s*:\s*"<FUNDING_HANDLE>"` or `"authorUrl"\s*:\s*"[^"]*github\.com/<FUNDING_HANDLE>"` ⇒ violation |

## B. Security — remote code and DOM injection (BLOCKER)

| ID | Pattern | Fix |
|---|---|---|
| SEC-001 | `\binnerHTML\s*=` | Replace with `createEl`, `createDiv`, `createSpan`, `setText`, `empty()` + `appendChild` |
| SEC-002 | `\bouterHTML\s*=` | Same as SEC-001 |
| SEC-003 | `\binsertAdjacentHTML\b` | Same as SEC-001 |
| SEC-004 | `document\.write\b` | Never valid; remove |
| SEC-005 | `\beval\s*\(` | Refactor; never allowed |
| SEC-006 | `new\s+Function\s*\(` | Refactor; treated as eval |
| SEC-007 | Remote script load: `createEl\(\s*["']script["']` or `\.src\s*=\s*["']https?:` on a script | Bundle code at build time; no runtime remote code |
| SEC-008 | `\bfetch\s*\(` used for cross-origin requests | Replace with `requestUrl` from `obsidian` (avoids CORS, required by reviewers) |
| SEC-009 | `process\.env\.` referencing anything beyond build-time constants | Move to settings or hardcoded constants |
| SEC-010 | `\.exec\s*\(` from `child_process` without `isDesktopOnly: true` | Either gate on Platform or set desktop-only |

## C. API misuse (BLOCKER / MAJOR)

| ID | Pattern | Severity | Fix |
|---|---|---|---|
| API-001 | `navigator\.(platform|userAgent)\b` | BLOCKER | Use `Platform` from `obsidian` |
| API-002 | `process\.platform\b` | BLOCKER | Use `Platform.isDesktop`, `Platform.isMacOS`, etc. |
| API-003 | Hardcoded `".obsidian"` path | MAJOR | Use `this.app.vault.configDir` |
| API-004 | Raw absolute/user-supplied path passed to `adapter.read/write` without `normalizePath` | MAJOR | Wrap in `normalizePath()` |
| API-005 | `app\.` (global `app`) reference outside dev-only code | MAJOR | Use `this.app` |
| API-006 | Direct file rewrite via `adapter.write` on an active file | MAJOR | Use `Vault.process()` for mutation, `Editor` API for the active editor |
| API-007 | `\.cast<|\bas\s+TFile\b|\bas\s+TFolder\b` | MAJOR | Use `instanceof TFile` / `instanceof TFolder` |
| API-008 | `detachLeavesOfType\s*\(` inside `onunload` | MAJOR | Remove; Obsidian manages leaves. Detaching causes state loss + leak on re-enable |
| API-009 | Storing `WorkspaceLeaf` / view reference as plugin field | MAJOR | Resolve via `getLeavesOfType` when needed |
| API-010 | `this.addCommand` with `hotkeys:` default set | MAJOR | Remove default hotkey; let user choose |
| API-011 | `setAttribute\(\s*["']aria-label["']` for tooltip | MINOR | Use `setTooltip()` |
| API-012 | File scanned via `adapter.list`/`readdir` instead of `vault.getMarkdownFiles()` / MetadataCache | MAJOR | Use Vault + MetadataCache |
| API-013 | Regex using lookbehind `(?<=` or `(?<!` | MAJOR (iOS breaks) | Rewrite without lookbehind |

## D. Code quality (MAJOR / MINOR)

| ID | Pattern | Severity | Fix |
|---|---|---|---|
| CQ-001 | `\bvar\s+\w` | MAJOR | Replace with `const` or `let` |
| CQ-002 | `:\s*any\b` or `<any>` | MAJOR | Specify the real type or `unknown` |
| CQ-003 | `console\.log\b` | MAJOR | Remove or replace with `console.debug` / `console.warn` / `console.error` |
| CQ-004 | `console\.info\b` | MAJOR | Same as CQ-003 |
| CQ-005 | Floating promise: `async` callback without `await`/`void`/`.catch` | MAJOR | Wrap in `void (async () => { ... })()` or `.catch(console.error)` |
| CQ-006 | `async` method with no `await` inside | MAJOR | Remove `async` keyword |
| CQ-007 | CommonJS `require\s*\(` in `.ts` source | MAJOR | Use ES `import` |
| CQ-008 | `Object\.assign\(\s*DEFAULT_SETTINGS` mutating the constant | MAJOR | `Object.assign({}, DEFAULT_SETTINGS, loaded)` |
| CQ-009 | Unused import / variable | MINOR | Remove (rely on compiler) |
| CQ-010 | Leftover sample boilerplate: `MyPlugin`, `Sample Modal`, `sample-editor-command` | MAJOR | Remove or rename |
| CQ-011 | `@ts-ignore` / `@ts-expect-error` without justification comment | MINOR | Delete or annotate |

## E. UI / UX consistency (MAJOR / MINOR)

| ID | Pattern | Severity | Fix |
|---|---|---|---|
| UI-001 | `createEl\(\s*["']h[1-6]["']` inside a settings tab | MAJOR | `new Setting(containerEl).setName('...').setHeading()` |
| UI-002 | Settings tab top-level heading like "X Settings" or plugin name | MAJOR | Remove (Obsidian already adds it) |
| UI-003 | UI string in Title Case in `.setName`, `.setButtonText`, `.setDesc`, `addCommand.name`, `new Notice(` | MINOR | Convert to sentence case |
| UI-004 | `addCommand` `name` containing "command" or the plugin name | MINOR | Remove redundancy |
| UI-005 | `addCommand` `id` containing plugin id or "command" | MINOR | Remove redundancy (prefix auto-added) |
| UI-006 | `new Notice(` fired for routine setting change | MAJOR | Remove noise notices |
| UI-007 | `element.style.*\s*=` (inline JS styles) | MAJOR | Move to `styles.css` or use `setCssProps({...})` / `classList` |
| UI-008 | `createEl\(\s*["']link["']` / `createEl\(\s*["']style["']` at runtime | MAJOR | Bundle styles in `styles.css` |
| UI-009 | Hardcoded color (`#[0-9a-f]{3,6}` in `.ts`) | MINOR | Use CSS variable: `var(--text-normal)`, `var(--background-modifier-border)`, etc. |
| UI-010 | Interactive icon-only button without `aria-label` / `setTooltip` | MAJOR | Add label |
| UI-011 | No `:focus-visible` rule in `styles.css` for custom interactive elements | MINOR | Add focus style |

## F. Memory & lifecycle (MAJOR / PERF)

| ID | Pattern | Severity | Fix |
|---|---|---|---|
| MEM-001 | `addEventListener` on DOM outside `registerDomEvent` | MAJOR | `this.registerDomEvent(el, 'x', handler)` |
| MEM-002 | `setInterval` / `setTimeout` (long-lived) not wrapped in `registerInterval` | MAJOR | `this.registerInterval(window.setInterval(...))` |
| MEM-003 | `workspace.on` / `vault.on` / `metadataCache.on` without `registerEvent` | MAJOR | `this.registerEvent(this.app.workspace.on(...))` |
| MEM-004 | `detachLeavesOfType` in `onunload` | MAJOR | Remove — see API-008 |
| MEM-005 | Unbounded `Set`/`Map` accumulated over runtime with no cleanup path | PERF | Add cleanup in `onunload` / on file-delete event |
| MEM-006 | Plugin used as a `Component` argument (`plugin` passed to `registerDomEvent` of another object) | MAJOR | Use `Component` subinstance with its own lifecycle |

## G. Performance (PERF)

| ID | Pattern | Fix |
|---|---|---|
| PERF-001 | Chained `.filter(...).filter(...)` on arrays over ~1000 items | Combine into single-pass loop |
| PERF-002 | `JSON.stringify(x, null, 2)` for on-disk data (not human-facing) | Use `JSON.stringify(x)` |
| PERF-003 | `Promise.all\(\s*\w+\.map` on unbounded collection | Batch with size cap (5–10) |
| PERF-004 | `Array.from\(\s*\w+\.(values|keys|entries)\(\)\s*\)` with no sort/index | Iterate the iterator directly |
| PERF-005 | Full view re-render inside a frequent event (e.g., `metadata-changed`) | Debounce / patch DOM in place |
| PERF-006 | Per-item `await` in a `for` loop over vault files (N+1) | Pre-build map, or `Promise.all` with batching |
| PERF-007 | File parsed via `vault.read` then string-searched for headings/links | Use `MetadataCache.getFileCache` instead |
| PERF-008 | Heavy work inside `onload` blocking startup | Defer with `workspace.onLayoutReady` |
| PERF-009 | Synchronous filesystem access on mobile path | Use `Vault` async API |

## H. Technical debt (DEBT)

| ID | Check | Fix |
|---|---|---|
| DEBT-001 | Any `.ts` file > 300 lines | Split into module |
| DEBT-002 | Filename containing `_v2`, `_new`, `enhanced_`, `improved_`, `manager2`, etc. | Consolidate into original; delete duplicate |
| DEBT-003 | Two or more functions doing the same thing with different names | Extract shared util |
| DEBT-004 | Literal TODO / FIXME / XXX comment without owner or date | Add context or resolve |
| DEBT-005 | `// removed` / `// legacy` commented-out code blocks | Delete |
| DEBT-006 | Copy-pasted settings-persistence code instead of `loadData`/`saveData` | Use plugin API |

## J. Buy Me A Coffee integration (MAJOR / MINOR / PERF / DEBT)

Canonical identities, from identity.json (treat as two distinct handles — do not conflate):

- **Author (GitHub / attribution)** — handle: `<AUTHOR_HANDLE>`, URL: `https://github.com/<AUTHOR_HANDLE>`.
  Used in `manifest.json#author`, `manifest.json#authorUrl`, `package.json#author`, LICENSE copyright line, and any README attribution.
- **Buy Me A Coffee (funding)** — handle: `<FUNDING_HANDLE>`, URL: `https://www.buymeacoffee.com/<FUNDING_HANDLE>`.
  Used in `manifest.json#fundingUrl`, README donate badge, and the settings-tab support section.

Canonical BMC badge image: `https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png` (or `.svg`).

The audit must confirm BMC is wired up *in the description page* (README.md) and *in the settings page* (settings tab class), both pointing at the correct id, without introducing security or perf regressions.

### J.1 Presence & id

| ID | Check | Severity | Fix |
|---|---|---|---|
| BMC-001 | `manifest.json` has a non-empty `fundingUrl` | MINOR | Add `"fundingUrl": "https://www.buymeacoffee.com/<FUNDING_HANDLE>"` |
| BMC-002 | `manifest.json#fundingUrl` host is `buymeacoffee.com` AND path contains `<FUNDING_HANDLE>` | MAJOR | Correct the URL to the canonical one |
| BMC-003 | `README.md` contains at least one `buymeacoffee.com/<FUNDING_HANDLE>` link | MINOR | Add badge block (see auto-fixes) |
| BMC-004 | `README.md` BMC image uses HTTPS (`https://...`) | BLOCKER | Replace with HTTPS; mixed content is rejected |
| BMC-005 | `README.md` BMC image host is `cdn.buymeacoffee.com` or `img.buymeacoffee.com` (not a random third-party mirror) | MAJOR | Use the canonical CDN |
| BMC-006 | Settings tab (`PluginSettingTab` subclass) renders a donate section that links to `buymeacoffee.com/<FUNDING_HANDLE>` | MINOR | Add a "Support" `Setting` with a button or image link |
| BMC-007 | Any BMC link in code or README has a wrong id (not `<FUNDING_HANDLE>`) | BLOCKER | Replace handle with `<FUNDING_HANDLE>` |
| BMC-008 | No leftover template handles (`YOUR_BMC_ID`, `USERNAME`, `<id>`, `example`) anywhere | MAJOR | Replace with `<FUNDING_HANDLE>` |

Grep patterns (run over `README.md`, `src/**/*.ts`, `main.ts`, `manifest.json`):
- Any BMC reference: `buymeacoffee\.com`
- Wrong id: `buymeacoffee\.com/(?!<FUNDING_HANDLE>\b)[A-Za-z0-9_-]+`
- Insecure http: `http://(?:www\.)?buymeacoffee\.com` or `http://cdn\.buymeacoffee\.com`
- Template placeholders: `YOUR_BMC_ID|YOUR_USERNAME|<bmc-id>|example_user`

### J.2 Security risks from BMC widget

| ID | Pattern | Severity | Fix |
|---|---|---|---|
| BMC-010 | BMC badge injected via `innerHTML` / `outerHTML` (SVG or `<img>`) | BLOCKER | Use `createEl('a', { href, cls })` + `createEl('img', { attr: { src, alt } })` |
| BMC-011 | Runtime `<script src="...buymeacoffee...widget.js">` loaded via `createEl('script')` | BLOCKER | Disallowed: no remote code execution. Use a static `<a><img></a>` badge only |
| BMC-012 | BMC `<a>` missing `rel="noopener noreferrer"` + `target="_blank"` when opened as external link | MAJOR | Add both attributes |
| BMC-013 | `window.open('https://www.buymeacoffee.com/<FUNDING_HANDLE>')` called from code without a noopener pattern | MAJOR | Use `window.open(url, '_blank', 'noopener,noreferrer')` or prefer `<a>` tag |
| BMC-014 | BMC settings button handler calls `require('electron').shell.openExternal` directly (desktop-only API leaking into a possibly-mobile plugin) | MAJOR | Use `window.open` with noopener, or gate on `Platform.isDesktop` |

### J.3 Performance / tech debt

| ID | Check | Severity | Fix |
|---|---|---|---|
| BMC-020 | BMC image re-created on every settings-tab `display()` call without caching while the tab is active | PERF | Build badge once and reuse; or rely on the framework to tear down — but do not fetch image every open if you can `createEl` lazily |
| BMC-021 | BMC `<img>` without `width`/`height` (causes layout shift when settings page opens) | PERF | Set explicit width/height attributes |
| BMC-022 | BMC image referenced via data-URL or bundled into `main.js` as base64 (bloats bundle) | PERF | Reference the public CDN URL instead |
| BMC-023 | BMC link string duplicated in 3+ places (manifest, README, one or more TS files) without a single source of truth | DEBT | Extract to a `BMC_URL` constant in `src/constants.ts` (or similar) |
| BMC-024 | BMC helper re-implemented in multiple files (e.g. both `settings.ts` and `view.ts` build a BMC button separately) | DEBT | Extract to one `createBmcButton(container)` util |
| BMC-025 | BMC `<img>` missing `alt` attribute | MINOR | Add `alt="Buy Me A Coffee"` |
| BMC-026 | Settings tab donate section uses inline JS styles for the image (`style.width = ...`) | MAJOR | Move to CSS (rule UI-007 already covers this; report as BMC-026 too for traceability) |
| BMC-027 | BMC image loaded with `fetch()` or `XMLHttpRequest` (e.g. to "validate" it) | PERF / MAJOR | Don't; use `<img src>` directly, let the browser handle it |
| BMC-028 | README contains BMC badge block more than once (duplicated on scroll) | DEBT | Keep a single badge near top or bottom, not both |

### J.4 Accessibility

| ID | Check | Severity | Fix |
|---|---|---|---|
| BMC-030 | BMC anchor has no accessible name (no text and no `aria-label` / `title` / `alt` on inner img) | MAJOR | Add `aria-label="Support the developer on Buy Me A Coffee"` |
| BMC-031 | BMC anchor is not keyboard-focusable (e.g. wrapped in a `<div>` with click handler instead of `<a>`) | MAJOR | Use an `<a href>` element |

## K. Runtime-only defects (MAJOR — invisible to typecheck, lint and unit tests)

Found only by running the plugin. See [demo-capture.md](./demo-capture.md) for how. Every one of
these passed a clean build in a real audit.

| ID | Check | Fix |
|---|---|---|
| RT-001 | A guard on an undocumented Obsidian internal that no longer exists, so the block never runs and the feature is silently dead. A hand-written `.d.ts` makes it typecheck. | Enumerate what the object really has at runtime (`Object.keys`), declare only that, and degrade rather than skip |
| RT-002 | A modal backing a promise that only settles from its buttons — Escape and the close button leave the caller awaiting forever, with no error | `onClose` must report a decision when none was made |
| RT-003 | DOM injected into Obsidian's own chrome (tab headers, title bars) is not removed in `onunload`. Obsidian cleans up ribbon icons and status bar items; it does not clean up a child you appended | Remove it explicitly on unload |
| RT-004 | A polling timer that does full work while nothing is active | Return early when there is nothing to poll |
| RT-005 | DOM rebuilt on a timer, dropping keyboard focus mid-interaction | Patch in place, and only when the value changed |
| RT-006 | A README or checklist claim that has never been observed running | Measure it during the capture run, or record it as unverified |

For the tab-header case specifically: current Obsidian exposes `tabHeaderEl`,
`tabHeaderInnerIconEl`, `tabHeaderInnerTitleEl` and `tabHeaderStatusContainerEl`. There is **no**
`tabHeaderInnerEl`, and `tabHeaderStatusContainerEl` is the correct mount point for a per-tab
indicator.

## I. Mobile (MAJOR if `isDesktopOnly: false`)

| ID | Pattern | Fix |
|---|---|---|
| MOB-001 | `require\s*\(\s*["'](fs\|path\|child_process\|os)["']\s*\)` | Gate on `Platform.isDesktop` OR set `isDesktopOnly: true` |
| MOB-002 | `import\s+.*\s+from\s+["'](fs\|path\|child_process\|os)["']` | Same as MOB-001 |
| MOB-003 | Regex lookbehind (see API-013) | Rewrite |
| MOB-004 | Large in-memory cache > 50 MB reachable on mobile | Bound cache size |

---

## L. Developer policy (BLOCKER — removal from the directory)

Full text and precedent: [submission-process.md](./submission-process.md).

| ID | Check |
|---|---|
| POL-001 | Plugin does not **install or update itself or its dependencies** — downloading a helper binary, model or CLI at runtime is installing a dependency, however well verified |
| POL-002 | README discloses **network use**, naming which remote services and why |
| POL-003 | README discloses **reading files outside the vault** — searching `PATH` and executing a system binary counts |
| POL-004 | No client-side telemetry; no ads outside the plugin's own UI; no obfuscated code |
| POL-005 | Not a fork of another community plugin without the original author's publicly verifiable approval |
| POL-006 | `fundingUrl` present only if donations are genuinely accepted |

## Running the catalog

1. For each rule group, issue the grep in parallel (10 at a time).
2. Merge results by file; cap 20 hits per rule in the report.
3. For manifest checks, `Read manifest.json` then parse with `JSON.parse` logic in your head — do not invoke a JS engine.
4. If a rule has no matches, omit it from the report entirely (keep the report signal-dense).

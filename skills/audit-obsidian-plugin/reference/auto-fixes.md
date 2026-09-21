# Auto-fix recipes

Mechanical substitutions. Each recipe lists: the rule it fixes, the search pattern, the replacement, and any caveats. Apply with `Edit` (or `Edit replace_all=true` where noted). **Always re-run the build after a batch.**

Rules marked "needs judgment" MUST NOT be auto-fixed; surface them in the report.

---

## SEC-001..003 — innerHTML / outerHTML / insertAdjacentHTML

Not safe for blind replace. Two patterns cover 90% of cases:

### Pattern A — plain text assignment
```ts
// BEFORE
el.innerHTML = userString;
// AFTER
el.setText(userString);
```

### Pattern B — empty + rebuild
```ts
// BEFORE
el.innerHTML = '<div class="x"><span>hi</span></div>';
// AFTER
el.empty();
el.createDiv({ cls: 'x' }).createSpan({ text: 'hi' });
```

Anything that mixes HTML with interpolated user content: leave for human. Note as "needs judgment".

## SEC-005..006 — eval / new Function

Never auto-fix. Flag and ask the user whether the construct can be removed.

## SEC-008 — fetch → requestUrl

```ts
// BEFORE
const r = await fetch(url, { method: 'GET', headers });
const data = await r.json();

// AFTER
import { requestUrl } from 'obsidian';
const r = await requestUrl({ url, method: 'GET', headers });
const data = r.json;
```

Caveats: `requestUrl` returns a synchronous `.json` getter, not a promise. Streaming responses are not supported — flag for human if the original uses `response.body`.

## API-001..002 — navigator / process.platform → Platform

```ts
// BEFORE
if (navigator.platform.indexOf('Mac') !== -1) { ... }
if (process.platform === 'darwin') { ... }

// AFTER
import { Platform } from 'obsidian';
if (Platform.isMacOS) { ... }
```

Mapping:
- `'darwin'` / `'Mac'` → `Platform.isMacOS`
- `'win32'` / `'Win'` → `Platform.isWin`
- `'linux'` / `'Linux'` → `Platform.isLinux`
- mobile detection → `Platform.isMobile`, `Platform.isIosApp`, `Platform.isAndroidApp`

## API-003 — hardcoded `.obsidian`

```ts
// BEFORE
const p = `.obsidian/plugins/${id}/data.json`;
// AFTER
const p = `${this.app.vault.configDir}/plugins/${id}/data.json`;
```

## API-004 — normalizePath

```ts
// BEFORE
await this.app.vault.adapter.read(userInputPath);
// AFTER
import { normalizePath } from 'obsidian';
await this.app.vault.adapter.read(normalizePath(userInputPath));
```

## API-007 — casting → instanceof

```ts
// BEFORE
const f = file as TFile;
doSomething(f);
// AFTER
import { TFile } from 'obsidian';
if (file instanceof TFile) doSomething(file);
```

Never auto-fix when the cast is on a known-safe local (e.g. after an explicit type guard); the `as` may be intentional narrowing. Flag only.

## API-008 — detachLeavesOfType in onunload

```ts
// BEFORE
onunload() {
  this.app.workspace.detachLeavesOfType(VIEW_TYPE);
}
// AFTER
onunload() {
  // Obsidian detaches leaves automatically; view class handles cleanup via onClose()
}
```

If the plugin relies on this for cleanup, move the cleanup into `view.onClose()`.

## API-010 — default hotkeys

```ts
// BEFORE
this.addCommand({ id: 'x', name: 'X', hotkeys: [{ modifiers: ['Mod'], key: 'p' }], ... });
// AFTER
this.addCommand({ id: 'x', name: 'X', ... });
```

## API-011 — setAttribute aria-label → setTooltip

```ts
// BEFORE
btn.setAttribute('aria-label', 'Refresh');
// AFTER
btn.setTooltip('Refresh');
```

Note: keep `aria-label` for static non-button elements that do not get Obsidian's tooltip helpers.

## CQ-001 — var → const / let

Safe in modern TS; let the compiler / linter pick `const` where unreassigned. Apply: `replace_all` of `var ` → `let `, then let the user (or a later pass) tighten to `const`.

## CQ-003..004 — console.log / console.info

```ts
// BEFORE
console.log('saved', data);
// AFTER
console.debug('saved', data);
```

If the log is a production progress message, delete it instead. Flag all `console.log` in `onload`/`onunload` for deletion — they are noise to end users.

## CQ-005 — floating promise in sync callback

```ts
// BEFORE
this.addCommand({ id: 'x', callback: async () => { await this.run(); } });
// AFTER
this.addCommand({ id: 'x', callback: () => { void this.run(); } });
```

For handlers with meaningful error paths, use `.catch(console.error)` instead of `void`.

## CQ-006 — async without await

```ts
// BEFORE
async onOpen() { this.draw(); }
// AFTER
onOpen() { this.draw(); }
```

Caveat: View lifecycle methods are typed `Promise<void>`. Keep `async` if removing it changes the return type Obsidian expects — flag for human.

## CQ-008 — settings default mutation

```ts
// BEFORE
this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
// AFTER
this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
```

## UI-001 — heading element in settings

```ts
// BEFORE
containerEl.createEl('h2', { text: 'General' });
// AFTER
new Setting(containerEl).setName('General').setHeading();
```

## UI-003 — Title Case → sentence case

Not safe to auto-fix mechanically; proper nouns and brand terms break. Instead:
1. Collect every `setName(...)`, `setButtonText(...)`, `setDesc(...)`, `name: '...'` in `addCommand`, and `new Notice('...')` string.
2. Present as a batch diff proposal.
3. Apply only after user approves.

## UI-007 — inline JS styles

```ts
// BEFORE
el.style.color = 'red';
el.style.display = 'flex';
// AFTER — option A: CSS class
el.addClass('plugin-x-error');
// styles.css: .plugin-x-error { color: var(--text-error); display: flex; }

// AFTER — option B: Obsidian helper
el.setCssProps({ color: 'var(--text-error)', display: 'flex' });
```

Prefer option A when the style is static. Require user review because selector naming matters.

## MEM-001 — addEventListener → registerDomEvent

```ts
// BEFORE
window.addEventListener('resize', this.onResize);
// AFTER
this.registerDomEvent(window, 'resize', this.onResize);
```

Inside a `View` or `Component`, use `this.registerDomEvent` on the component instance.

## MEM-002 — setInterval → registerInterval

```ts
// BEFORE
this.timer = window.setInterval(() => this.tick(), 1000);
// AFTER
this.registerInterval(window.setInterval(() => this.tick(), 1000));
```

## MEM-003 — workspace.on without registerEvent

```ts
// BEFORE
this.app.workspace.on('file-open', this.onFileOpen);
// AFTER
this.registerEvent(this.app.workspace.on('file-open', this.onFileOpen));
```

## PERF-001 — chained filters

Needs judgment. Propose:
```ts
// BEFORE
const out = items.filter(isFoo).filter(isBar).filter(isBaz);
// AFTER
const out: Item[] = [];
for (const it of items) if (isFoo(it) && isBar(it) && isBaz(it)) out.push(it);
```

## PERF-002 — pretty-printed JSON on disk

Safe mechanical: `JSON.stringify(data, null, 2)` → `JSON.stringify(data)` when the result goes to `saveData`/`adapter.write`. Leave pretty-print for human-facing export files.

## PERF-003 — Promise.all over unbounded map

```ts
// BEFORE
await Promise.all(files.map(f => process(f)));
// AFTER
const BATCH = 8;
for (let i = 0; i < files.length; i += BATCH) {
  await Promise.all(files.slice(i, i + BATCH).map(f => process(f)));
}
```

## DEBT-001 — file > 300 lines

Never auto-fix. Flag with a suggested split (e.g. "extract `settings-tab.ts`, `view.ts` from `main.ts`").

## DEBT-002 — `_v2` / `enhanced_` filename

Never auto-fix. Flag and propose consolidation plan in the report.

---

---

## MAN-018..022 — canonical author identity

`author` / `authorUrl` refer to the GitHub attribution, NOT the BMC funding id. Keep the two separate:

- Author handle (GitHub): `<AUTHOR_HANDLE>` → `https://github.com/<AUTHOR_HANDLE>`
- BMC handle (funding): `<FUNDING_HANDLE>` → `https://www.buymeacoffee.com/<FUNDING_HANDLE>`

```json
// manifest.json
{
  "author": "<AUTHOR_HANDLE>",
  "authorUrl": "https://github.com/<AUTHOR_HANDLE>",
  "fundingUrl": "https://www.buymeacoffee.com/<FUNDING_HANDLE>"
}
```

```json
// package.json
{
  "author": "<AUTHOR_HANDLE>"
}
```

```
// LICENSE (MIT example)
Copyright (c) <YEAR> <AUTHOR_HANDLE>
```

Red flag: if `manifest.json#author` is `"<FUNDING_HANDLE>"` or `authorUrl` points at `github.com/<FUNDING_HANDLE>`, treat it as MAN-022 — the BMC id leaked into the author field. Rewrite to `<AUTHOR_HANDLE>` / `https://github.com/<AUTHOR_HANDLE>`; leave `fundingUrl` alone.

## BMC-001..002 — missing or wrong fundingUrl in manifest

```json
// manifest.json
{
  "id": "...",
  "name": "...",
  "version": "...",
  "author": "<AUTHOR_HANDLE>",
  "authorUrl": "https://github.com/<AUTHOR_HANDLE>",
  "fundingUrl": "https://www.buymeacoffee.com/<FUNDING_HANDLE>"
}
```

For a multi-platform funding object, use:
```json
"fundingUrl": {
  "Buy Me A Coffee": "https://www.buymeacoffee.com/<FUNDING_HANDLE>"
}
```

Both are accepted by Obsidian; string form is preferred for simplicity.

## BMC-003..005 — README badge

Place once at the end of the README (or under a "Support" heading), not duplicated:

```markdown
## Support

If this plugin is useful to you, you can support development here:

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="180" height="50">](https://www.buymeacoffee.com/<FUNDING_HANDLE>)
```

Caveats:
- Must be HTTPS on both the image and the link (BMC-004).
- Include `width` and `height` to avoid layout shift (BMC-021).
- Include `alt` for screen readers (BMC-025, BMC-030).

## BMC-006 — settings-tab donate section

Use `createEl`, never `innerHTML`. Extract to a shared helper so it is not duplicated.

```ts
// src/constants.ts
export const BMC_URL = 'https://www.buymeacoffee.com/<FUNDING_HANDLE>';
export const BMC_IMG = 'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png';

// src/ui/bmc-button.ts
import { BMC_URL, BMC_IMG } from '../constants';

export function createBmcButton(container: HTMLElement): HTMLAnchorElement {
  const a = container.createEl('a', {
    href: BMC_URL,
    cls: 'quiz-cards-bmc-link',
    attr: {
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': 'Support the developer on Buy Me A Coffee',
    },
  });
  a.createEl('img', {
    attr: {
      src: BMC_IMG,
      alt: 'Buy Me A Coffee',
      width: '180',
      height: '50',
    },
  });
  return a;
}
```

Call it once from the settings tab `display()`:
```ts
import { createBmcButton } from './ui/bmc-button';

display(): void {
  const { containerEl } = this;
  containerEl.empty();
  // ... your settings ...
  new Setting(containerEl).setName('Support').setHeading();
  const wrap = containerEl.createDiv({ cls: 'quiz-cards-bmc-wrap' });
  createBmcButton(wrap);
}
```

Matching CSS (in `styles.css` — keep styles out of TS):
```css
.quiz-cards-bmc-wrap { margin-top: var(--size-4-4); }
.quiz-cards-bmc-link img { display: block; border: 0; }
.quiz-cards-bmc-link:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: 2px; }
```

## BMC-007..008 — wrong handle / leftover placeholder

Safe mechanical rewrite across README.md, all `.ts`, and `manifest.json`:
- `buymeacoffee.com/<anything>` → `buymeacoffee.com/<FUNDING_HANDLE>`
- `YOUR_BMC_ID` / `YOUR_USERNAME` / `<bmc-id>` → `<FUNDING_HANDLE>`

Use `Edit replace_all=true` per file after confirming with the user that no other user's id was intentional.

## BMC-010..011 — innerHTML or script injection

Never apply blindly. Translate each occurrence to `createEl` + `createEl('img', ...)` per the helper in BMC-006. If the source was a `<script>` widget, delete it outright — Obsidian plugins cannot load third-party widget scripts at runtime (SEC-007).

## BMC-012..013 — rel / target on external link

```ts
// BEFORE
container.createEl('a', { href: BMC_URL, text: 'Donate' });
// AFTER
container.createEl('a', {
  href: BMC_URL,
  text: 'Donate',
  attr: { target: '_blank', rel: 'noopener noreferrer' },
});
```

## BMC-023 — duplicated BMC url string

Move the literal into `src/constants.ts` (see BMC-006 helper) and replace every other site with the constant. `manifest.json` and `README.md` keep their own copy — those are the published artifacts — but every `.ts` reference should pull from the single constant.

## BMC-024 — duplicated BMC button helpers

Consolidate into `src/ui/bmc-button.ts` as shown. Delete the other definitions; the project-level CLAUDE.md forbids `_v2` / `enhanced_` copies.

---

## Fix batch discipline

1. Group fixes by rule ID. Apply one rule at a time across all files.
2. After each group, run `npm run build` (or `tsc --noEmit`).
3. If build breaks, revert that batch with `Edit` and mark the rule as "needs human".
4. Do not mix unrelated fixes in one commit. Do not commit unless the user asks.

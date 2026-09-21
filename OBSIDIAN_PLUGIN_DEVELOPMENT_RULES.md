# Obsidian Plugin Development Rules

This document defines the mandatory rules and best practices for developing Obsidian plugins. Follow these rules strictly to pass the official review process.

---

## 1. Project Structure

### 1.1 Required Files
```
plugin-root/
├── main.ts          # Plugin entry point (onload, onunload, core registration)
├── manifest.json    # Plugin metadata (id, version, name, description)
├── styles.css       # Plugin styles (use CSS variables)
├── LICENSE          # Required for submission
├── src/
│   ├── settings/    # PluginSettingTab implementation
│   ├── ui/          # Views, Modals, UI components
│   ├── services/    # Business logic, data processing
│   ├── utils/       # Utility functions
│   └── types/       # TypeScript interfaces
```

### 1.2 manifest.json Rules

**Plugin ID restrictions:**
- MUST NOT contain "obsidian"
- MUST NOT end with "plugin"
- MUST be lowercase only

**Plugin Name restrictions:**
- MUST NOT contain "Obsidian"
- MUST NOT end with "Plugin"
- MUST NOT start with "Obsi" or end with "dian"

**Description restrictions:**
- MUST NOT contain "Obsidian"
- MUST NOT start with "This plugin"
- MUST end with punctuation (`.` `?` `!` `)`)
- SHOULD be under 250 characters
- MUST match GitHub repo description exactly (byte-to-byte)

**Example:**
```json
{
  "id": "podcast-player",
  "name": "Podcast Player",
  "description": "A feature-rich podcast player and manager."
}
```

---

## 2. TypeScript Configuration

### 2.1 Required tsconfig.json Settings
```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "target": "es6",
    "esModuleInterop": true,
    "importHelpers": true
  }
}
```

### 2.2 Async/Await Rules

**RULE: No floating promises**
- Promise-returning functions in callbacks MUST be explicitly handled
- Use `void` operator or `.catch()` for fire-and-forget patterns

```typescript
// WRONG: Floating promise
this.addCommand({
  id: 'sync',
  callback: async () => { await this.sync(); }
});

// CORRECT: Using void operator
this.addCommand({
  id: 'sync',
  callback: () => { void this.sync(); }
});

// CORRECT: Using catch
this.addCommand({
  id: 'sync',
  callback: () => { this.sync().catch(console.error); }
});
```

**RULE: Wrap async callbacks with void IIFE pattern**
- Menu `.onClick()`, button event handlers, etc. expect `() => void`
- For complex async logic, use the void IIFE pattern

```typescript
// WRONG: Returns Promise, type mismatch
menu.addItem((item) =>
  item.setTitle('Delete').onClick(async () => {
    await this.deleteItem();
    await this.refresh();
  })
);

// CORRECT: void IIFE pattern
menu.addItem((item) =>
  item.setTitle('Delete').onClick(() => {
    void (async () => {
      await this.deleteItem();
      await this.refresh();
    })();
  })
);

// CORRECT: Simple single call can use void directly
menu.addItem((item) =>
  item.setTitle('Refresh').onClick(() => void this.refresh())
);
```

**RULE: No useless async**
- Functions marked `async` MUST contain at least one `await`
- Remove `async` if function has no async operations
- **EXCEPTION:** Override methods MUST match base class signature

```typescript
// WRONG: Useless async
async getData(): Promise<string> {
  return "data";
}

// CORRECT: Remove async
getData(): string {
  return "data";
}

// EXCEPTION: Override methods must match base signature
// ItemView.onClose() returns Promise<void>, so keep async even without await
class MyView extends ItemView {
  // CORRECT: Must match base class signature
  async onClose(): Promise<void> {
    this.cleanup(); // sync operation, but async required for override
  }
}
```

**RULE: No await on non-Promise**
- `await` MUST only be used on Promise values

### 2.3 Type Safety Rules

**RULE: No `any` type**
- Use specific types or `unknown` with type guards
- Casting to `any` should be avoided as much as possible

```typescript
// WRONG
function process(data: any) { ... }

// CORRECT
function process(data: unknown) {
  if (isValidData(data)) { ... }
}

function isValidData(data: unknown): data is MyDataType {
  return typeof data === 'object' && data !== null && 'field' in data;
}
```

**RULE: Use `instanceof` for type checking**
- Do not cast directly; use `instanceof` to verify type first

```typescript
// WRONG: Direct casting without verification
const file = this.app.vault.getAbstractFileByPath(path) as TFile;

// CORRECT: instanceof check first
const abstractFile = this.app.vault.getAbstractFileByPath(path);
if (abstractFile instanceof TFile) {
  // Now TypeScript knows it's a TFile
  const content = await this.app.vault.read(abstractFile);
}
```

**RULE: Prefer `const` and `let` over `var`**
- Never use `var`; use `const` for immutable bindings, `let` for mutable

**RULE: No unused variables**
- Remove unused imports, variables, and parameters
- For DOM elements created without reference, omit the variable assignment

```typescript
// WRONG: Unused variable
const img = container.createEl('img', { attr: { src: url } });
// img is never used

// CORRECT: Omit variable if not needed
container.createEl('img', { attr: { src: url } });

// WRONG: Unused import
import { Queue, Episode } from '../model';
// Queue is never used

// CORRECT: Remove unused imports
import { Episode } from '../model';
```

**RULE: Avoid object stringification**
- `String(object)` produces `[object Object]`
- Use `JSON.stringify()` for objects

```typescript
// WRONG: Results in "[object Object]"
const value: unknown = someObject;
const str = `key: ${String(value)}`;

// CORRECT: Handle objects explicitly
if (typeof value === 'object' && value !== null) {
  str = `key: ${JSON.stringify(value)}`;
} else {
  str = `key: ${String(value)}`;
}
```

### 2.4 `this` Binding Rules

**RULE: Bind `this` when passing methods as callbacks**

```typescript
// WRONG: this context may be lost
callback: this.handler

// CORRECT: Arrow function
callback: () => this.handler()

// CORRECT: Bind
callback: this.handler.bind(this)

// CORRECT: Declare this: void if not needed
handler(this: void, arg: string) { ... }
```

### 2.5 TypeScript Closure Narrowing

**RULE: Type narrowing is lost inside async IIFE**
- TypeScript cannot guarantee narrowed types persist across async boundaries
- Extract narrowed values to local variables before async IIFE

```typescript
// WRONG: Type narrowing lost inside async IIFE
if (this.currentId) {  // narrowed to string
  void (async () => {
    // ERROR: this.currentId is string | null again
    await manager.process(this.currentId);
  })();
}

// CORRECT: Extract to local variable
const id = this.currentId;
if (id) {  // id is narrowed to string
  void (async () => {
    // id is still string (local variable captured)
    await manager.process(id);
  })();
}
```

---

## 3. Deprecated APIs

### 3.1 Icon Buttons

**DEPRECATED:** `setClickableIcon()`

**REQUIRED:** Use `setIcon()` + `clickable-icon` CSS class

```typescript
import { setIcon } from 'obsidian';

// WRONG: Deprecated API
// button.setClickableIcon('play');

// CORRECT: setIcon with clickable-icon class
const btn = container.createEl('button', {
  cls: 'my-button clickable-icon',
  attr: { 'aria-label': 'Play' }
});
setIcon(btn, 'play');
```

**WHY `clickable-icon` is required:**
- Provides correct hover states
- Maintains visual consistency with Obsidian native UI
- Works correctly across all themes

### 3.2 Platform Detection

**DEPRECATED:** `app.isMobile`

**REQUIRED:** Use `Platform` static API

```typescript
import { Platform } from 'obsidian';

// WRONG: Deprecated
// if (this.app.isMobile) { ... }

// CORRECT: Platform API
if (Platform.isMobile) { ... }
if (Platform.isDesktop) { ... }
```

**Available Platform properties:**
| Property | Description |
|----------|-------------|
| `Platform.isMobile` | Mobile device |
| `Platform.isDesktop` | Desktop app |
| `Platform.isMacOS` | macOS |
| `Platform.isWin` | Windows |
| `Platform.isLinux` | Linux |
| `Platform.isIosApp` | iOS app |
| `Platform.isAndroidApp` | Android app |

---

## 4. Security Rules

### 4.1 DOM Manipulation

**FORBIDDEN:** `innerHTML`, `outerHTML`, `insertAdjacentHTML` with user input

**REQUIRED:** Use `createEl()` for safe DOM construction

```typescript
// WRONG: XSS vulnerability
element.innerHTML = `<div>${userInput}</div>`;

// CORRECT: Auto-escaped
element.createEl('div', { text: userInput });
```

**For Markdown rendering:** Use `MarkdownRenderer.render()` (includes sanitization)

### 4.2 Network Requests

**FORBIDDEN:** `fetch()` API

**REQUIRED:** `requestUrl()` from Obsidian API

```typescript
import { requestUrl } from 'obsidian';

// WRONG: CORS issues, not cross-platform
// const res = await fetch(url);

// CORRECT: Bypasses CORS, works on all platforms
const res = await requestUrl({ url: url });
const data = res.json;
```

**WHY:**
- `fetch()` is blocked by CORS on many servers
- `requestUrl()` routes through Electron main process, bypassing CORS
- Works on both desktop and mobile

### 4.3 Node.js APIs

**FORBIDDEN (unless `isDesktopOnly: true`):** `fs`, `path`, `os` modules

**REQUIRED:** Use `app.vault` API for file operations

```typescript
// WRONG: Breaks on mobile
import * as fs from 'fs';
fs.readFileSync(path);

// CORRECT: Cross-platform
await this.app.vault.read(file);
await this.app.vault.modify(file, content);
```

### 4.4 External Code Execution

**FORBIDDEN:**
- `eval()`
- `new Function()`
- Remote script loading (`<script src="...">`)

All JavaScript MUST be bundled in the plugin package.

### 4.5 Regex Compatibility

**FORBIDDEN:** Regex lookbehind syntax (breaks iOS/Safari)

```typescript
// WRONG: Lookbehind breaks on iOS
const pattern = /(?<=\s)word/;

// CORRECT: Rewrite without lookbehind
const pattern = /\s(word)/;
// Then extract group 1
```

**WHY:** Safari/iOS does not fully support regex lookbehind. Plugins using lookbehind will crash on iOS devices.

### 4.6 Path Handling

**REQUIRED:** Use `normalizePath()` for user-provided file paths

```typescript
import { normalizePath } from 'obsidian';

// WRONG: Raw user input
const path = userInput;

// CORRECT: Normalize path
const path = normalizePath(userInput);
```

---

## 5. Lifecycle Management

### 5.1 onload() Rules

**SHOULD contain:**
- Command registration
- View registration
- Settings tab registration
- Event listeners (using `registerEvent`, `registerDomEvent`, `registerInterval`)

**SHOULD NOT contain:**
- Heavy data processing
- File scanning
- Complex UI initialization

**Use `onLayoutReady` for deferred initialization:**
```typescript
async onload() {
  // Light initialization only
  this.registerView(...);
  this.addCommand(...);

  // Heavy work after layout ready
  this.app.workspace.onLayoutReady(() => {
    void this.initializeData();
  });
}
```

### 5.2 onunload() Rules

**MUST NOT:** Call `detachLeavesOfType()` for persistent views

**WHY:** Breaks workspace state restoration on plugin reload/update

```typescript
// WRONG: Destroys user's workspace layout
async onunload() {
  this.app.workspace.detachLeavesOfType(VIEW_TYPE);
}

// CORRECT: Let Obsidian handle view lifecycle
async onunload() {
  // Only cleanup non-auto-managed resources
  // Views registered with registerView() are auto-cleaned
}
```

**onunload SHOULD only cleanup:**
- Global event listeners not registered via `registerDomEvent`
- Timers not registered via `registerInterval`
- External resources (WebSocket connections, etc.)

### 5.3 Event Registration

**REQUIRED:** Use plugin registration methods for automatic cleanup

```typescript
// WRONG: Manual cleanup required
window.addEventListener('resize', this.handler);

// CORRECT: Auto-cleanup on unload
this.registerDomEvent(window, 'resize', this.handler);
this.registerEvent(this.app.workspace.on('file-open', this.handler));
this.registerInterval(window.setInterval(this.tick, 1000));
```

---

## 6. UI/UX Rules

### 6.1 Styling

**FORBIDDEN:** Hardcoded colors, inline styles

**REQUIRED:** CSS classes, CSS variables

```typescript
// WRONG: Breaks themes
el.style.backgroundColor = '#000';
el.style.color = '#fff';

// CORRECT: CSS class
el.addClass('my-component');

// CORRECT: Dynamic values via CSS properties
el.setCssProps({ '--progress-width': `${percent}%` });
```

**Required CSS variables:**
| Purpose | Variable |
|---------|----------|
| Background | `--background-primary`, `--background-secondary` |
| Text | `--text-normal`, `--text-muted`, `--text-accent` |
| Interactive | `--interactive-accent`, `--interactive-hover` |
| Border | `--background-modifier-border` |

### 6.2 Text Formatting

**REQUIRED:** Sentence case for all UI text

```
WRONG: Auto Download Episodes
CORRECT: Auto download episodes

WRONG: Save Settings
CORRECT: Save settings
```

**Exception:** Proper nouns (Obsidian, GitHub, etc.)

### 6.3 Settings Page

**REQUIRED:**
- Instant save (no explicit "Save" button)
- Use `PluginSettingTab` class
- Avoid large headers at top

### 6.4 Icons

**REQUIRED:** Use built-in Lucide icons when possible

**For custom SVG icons:**
- Remove `width`, `height`, `fill` attributes
- Use `fill="currentColor"`
- Register via `addIcon()` API

### 6.5 Commands

**Command naming rules:**
- Do NOT include "command" in command names or IDs
- Do NOT include plugin ID in command IDs
- Never set default hotkeys; let users configure them

```typescript
// WRONG
this.addCommand({
  id: 'podcast-player-play-command',
  name: 'Play command',
  ...
});

// CORRECT
this.addCommand({
  id: 'play-episode',
  name: 'Play episode',
  ...
});
```

### 6.6 Settings Tab

**REQUIRED:**
- Use `.setHeading()` for section headings
- Instant save (no explicit "Save" button)
- Use `PluginSettingTab` class
- Avoid large headers at top of settings

```typescript
// CORRECT: Use setHeading for sections
new Setting(containerEl).setName('Playback').setHeading();

new Setting(containerEl)
  .setName('Auto-play next episode')
  .setDesc('Automatically play the next episode when current one ends')
  .addToggle(toggle => ...);
```

---

## 7. Accessibility (MANDATORY)

Accessibility is **mandatory** for Obsidian plugins. All interactive elements must be accessible.

### 7.1 Keyboard Navigation

**REQUIRED:** All interactive elements must be keyboard accessible

```typescript
// REQUIRED: Tab, Enter, Space navigation support
button.setAttribute('tabindex', '0');
button.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    this.handleClick();
  }
});
```

### 7.2 ARIA Labels

**REQUIRED:** Icon buttons must have ARIA labels

```typescript
// WRONG: No accessibility
const btn = container.createEl('button');
setIcon(btn, 'play');

// CORRECT: With aria-label
const btn = container.createEl('button', {
  cls: 'clickable-icon',
  attr: { 'aria-label': 'Play episode' }
});
setIcon(btn, 'play');
```

### 7.3 Focus Indicators

**REQUIRED:** Define clear focus indicators using `:focus-visible`

```css
.my-button:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: 2px;
}
```

### 7.4 Touch Targets

**REQUIRED for mobile:** Touch targets must be at least 44×44 pixels

```css
.my-touch-button {
  min-width: 44px;
  min-height: 44px;
}
```

### 7.5 Tooltips

**Use `data-tooltip-position` for tooltip positioning:**

```typescript
button.setAttribute('aria-label', 'Play episode');
button.setAttribute('data-tooltip-position', 'top');
```

---

## 8. File Operations

### 8.1 Reading Files

```typescript
// Get file reference
const file = this.app.vault.getAbstractFileByPath(path);

// Type check required
if (!(file instanceof TFile)) {
  return; // Handle folder or null
}

// Read content
const content = await this.app.vault.read(file);
```

### 8.2 Writing Files

```typescript
// Modify existing file
await this.app.vault.modify(file, newContent);

// Create new file
await this.app.vault.create(path, content);
```

### 8.3 Frontmatter Operations

**REQUIRED:** Use `processFrontMatter()` for atomic operations

```typescript
// WRONG: Race conditions, format issues
const content = await this.app.vault.read(file);
const modified = content.replace(/key: .*/,  'key: newValue');
await this.app.vault.modify(file, modified);

// CORRECT: Atomic, safe
await this.app.fileManager.processFrontMatter(file, (fm) => {
  fm['key'] = 'newValue';
  fm['tags'] = fm['tags'] || [];
  fm['tags'].push('processed');
});
```

### 8.4 Background File Modifications

**REQUIRED:** Use `Vault.process()` for background file modifications

```typescript
// For modifying files not currently being edited
await this.app.vault.process(file, (content) => {
  return content.replace('old', 'new');
});
```

### 8.5 Editor Operations

**REQUIRED:** Use Editor API for editing the active file

```typescript
// WRONG: Direct vault modification of active file
await this.app.vault.modify(activeFile, newContent);

// CORRECT: Use Editor API
const editor = this.app.workspace.activeEditor?.editor;
if (editor) {
  editor.replaceRange('new text', { line: 0, ch: 0 }, { line: 0, ch: 10 });
}
```

---

## 9. Submission Checklist

Work through this before submitting to the Obsidian Community directory.

### 9.1 Code Cleanup
- [ ] Remove all `console.log` statements (especially in `onload`/`onunload`)
- [ ] Remove sample plugin boilerplate code (MyPlugin, SampleModal, etc.)
- [ ] Remove template comments and placeholder implementations
- [ ] No hardcoded colors - use CSS variables
- [ ] No `innerHTML` with user input
- [ ] No `fetch()` - use `requestUrl()`
- [ ] No `app.isMobile` - use `Platform.isMobile`
- [ ] No `setClickableIcon` - use `setIcon` + `clickable-icon` class
- [ ] No `detachLeavesOfType` in `onunload`
- [ ] No regex lookbehind (breaks iOS)

### 9.2 Metadata
- [ ] Plugin ID: lowercase only, no "obsidian", not ending with "plugin"
- [ ] Plugin name: no "Obsidian", not ending with "Plugin"
- [ ] Description: no "Obsidian", no "This plugin", ends with punctuation
- [ ] GitHub repo description matches manifest description exactly
- [ ] LICENSE file exists in root
- [ ] GitHub issues enabled on repository

### 9.3 Async Code
- [ ] No floating promises (use `void` or void IIFE pattern)
- [ ] No useless `async` (exception: override methods must match base signature)
- [ ] No `await` on non-Promise values
- [ ] Proper `this` binding in callbacks
- [ ] Extract narrowed values before async IIFE to preserve type narrowing

### 9.4 Code Quality
- [ ] No unused variables or imports
- [ ] No `[object Object]` - use `JSON.stringify()` for objects
- [ ] UI text uses sentence case (not Title Case)
- [ ] Use `instanceof` for type checking, not casting
- [ ] No `any` type - use specific types or `unknown`
- [ ] Command names: no "command", no plugin ID prefix

### 9.5 Accessibility
- [ ] All icon buttons have `aria-label`
- [ ] Interactive elements are keyboard accessible
- [ ] Touch targets are at least 44×44px (mobile)
- [ ] Focus indicators defined with `:focus-visible`

### 9.6 Mobile Compatibility
- [ ] Test on iOS if not desktop-only
- [ ] No regex lookbehind
- [ ] No Node.js APIs (fs, path, os)
- [ ] Touch targets sized appropriately

### 9.7 Policy (removal from the directory if broken)
- [ ] Plugin does **not install or update itself or its dependencies** — downloading a helper
      binary, model or CLI at runtime counts, however well it is pinned and verified
- [ ] README discloses network use, naming which remote services and why
- [ ] README discloses reading files outside the vault (searching `PATH` and executing a system
      binary counts)
- [ ] No client-side telemetry, no obfuscated code, no ads outside the plugin's own UI
- [ ] Not a fork of another community plugin without the original author's written approval
- [ ] `fundingUrl` present only if donations are genuinely accepted

### 9.8 Release and submission

> [!warning] The submission process changed in 2026.
> Plugins are **no longer** submitted by opening a pull request against
> `obsidianmd/obsidian-releases` and adding an entry to `community-plugins.json`. That repository
> is now a read-only registry. Guidance that tells you to edit that file is out of date.

- [ ] The work is on the **default branch** — the directory reads `manifest.json` from its HEAD
- [ ] `npm config get tag-version-prefix` is **empty**, not `v`. Obsidian requires the release tag
      to equal the manifest version exactly (`1.0.0`, not `v1.0.0`), and npm adds `v` by default.
      Fix it with an `.npmrc` containing `tag-version-prefix=""`
- [ ] Release tag matches `manifest.json` version exactly, with `main.js`, `manifest.json` and
      `styles.css` attached as **individual binary assets**, not a zip
- [ ] No credential anywhere in the **git history**, not just the working tree — and note that
      force-pushing does not remove it from GitHub, which keeps unreferenced objects reachable
      by SHA
- [ ] Submit at **[community.obsidian.md](https://community.obsidian.md)**: sign in with an
      **Obsidian account**, link the GitHub account that owns the repository, then add the plugin
- [ ] Expect an automated scan for code quality, security and malware. A new submission must pass
      before being listed; a published plugin that later fails is dropped from search within
      24 hours

---

## 10. Quick Reference

### Deprecated → Required Replacement

| Deprecated | Required |
|------------|----------|
| `setClickableIcon()` | `setIcon()` + `clickable-icon` class |
| `app.isMobile` | `Platform.isMobile` |
| `fetch()` | `requestUrl()` |
| `innerHTML` | `createEl()` |
| `element.style.x = y` | CSS classes or `setCssProps()` |
| `window.addEventListener` | `registerDomEvent()` |
| `setInterval` | `registerInterval()` |
| `fs` module | `app.vault` API |

### Common Review Failures

| Error | Fix |
|-------|-----|
| `Promise-returning function provided where void expected` | Wrap with `void` or use void IIFE pattern |
| `Async method has no await` | Remove `async` or add `await` (exception: override methods) |
| `Unexpected any` / `Casting to any` | Use specific type or `unknown` + type guard |
| `Don't detach leaves in onunload` | Remove `detachLeavesOfType()` call |
| `Do not write to DOM using innerHTML` | Use `createEl()` or `sanitizeHTML()` |
| `Use requestUrl instead of fetch` | Replace `fetch()` with `requestUrl()` |
| `Description mismatch` | Sync manifest.json, repo description, PR description |
| `Unused variable` | Remove or omit variable assignment |
| `[object Object] in output` | Use `JSON.stringify()` for objects |
| `Type 'null' is not assignable` in async IIFE | Extract to local variable before IIFE |
| `Override method signature mismatch` | Match base class return type (keep `async` if base returns `Promise`) |
| `Use instanceof check` | Don't cast directly; verify type with `instanceof` first |
| `Plugin ID contains obsidian` | Remove "obsidian" from plugin ID |
| `Plugin name ends with Plugin` | Remove "Plugin" suffix from name |
| `No license file` | Add LICENSE file to repository root |
| `Regex lookbehind` | Rewrite regex without lookbehind (iOS incompatible) |
| `Missing aria-label` | Add `aria-label` to icon buttons |

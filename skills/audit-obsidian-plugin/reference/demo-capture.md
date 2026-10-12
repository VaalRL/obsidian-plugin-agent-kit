# Driving Obsidian, and capturing README demos

How to run a real plugin in a real Obsidian, verify the states that only exist at runtime, and
turn them into README screenshots and GIFs. Working scripts are in
[`../scripts/demo-capture/`](../scripts/demo-capture/).

This exists because **a whole class of defect is invisible to the typechecker, the linter and the
test suite, and only appears when the plugin is actually running.** In one audit it found a
feature that had never rendered in any shipped build: the guard was `if (leaf.tabHeaderInnerEl)`,
a property current Obsidian does not have, so the block was silently skipped forever. It
typechecked, because the plugin's own `types/index.ts` declared the property that does not exist.

---

## What you need

Nothing installed beyond Obsidian itself, which the scripts look for in its usual place on
Windows, macOS and Linux (set `OBSIDIAN_EXE` otherwise). A Linux machine without Obsidian — a
container, a CI runner, a cloud session — can get one with `node fetch-obsidian.mjs`, which
downloads the AppImage and extracts it (no FUSE needed); the scripts find that copy on their own.
Then:

- **Node 22+** has a global `WebSocket`, so a Chrome DevTools Protocol client is ~100 lines with
  zero dependencies. No puppeteer.
- **Python with Pillow** encodes the GIF. Check first: `python -c "import PIL"`. If ffmpeg,
  ImageMagick and gifski are all absent — they usually are — Pillow is the way through.

## Bringing Obsidian up

```bash
<obsidian> --remote-debugging-port=9444 --user-data-dir=<throwaway>
```

`--user-data-dir` gives a completely isolated install: its own `obsidian.json` (write one listing
only the demo vault), its own localStorage, its own settings. **The user's real vault list,
plugins and settings are never touched.** Always use it.

Three details decide whether the demo vault actually opens:

- **The vault path in `obsidian.json` must be in the platform's native form.** A Windows-style
  `\tmp\demo` path on Linux does not fail loudly: Obsidian opens its vault picker
  (`starter.html`) instead of the vault, and the plugin never loads.
- **Fix the window size in `<user-data-dir>/<vault id>.json`** (`{"width":1180,"height":780,…}`).
  Obsidian applies it at startup; `Browser.setWindowBounds` is not available on every build.
- **Running as root** (containers, CI) needs `--no-sandbox`, or Chromium refuses to start.

Without a display (`DISPLAY` unset on Linux), `launch.mjs` starts `Xvfb` for the app to draw on.
Screenshots come from the renderer, so nothing has to be visible to anyone.

Then `GET http://127.0.0.1:<port>/json/list`, take the **main window** — the `page` target whose
URL starts with `app://obsidian.md/index.html` (pop-outs and, in current versions, the settings
window are separate targets) — and open its `webSocketDebuggerUrl`.

### Four things that will stop you

**1. `activeWindow` / `activeDocument` — the one that costs hours.**

Obsidian supports pop-out windows, so it routes modals and notices through its own
`activeWindow`/`activeDocument` globals rather than `window`/`document`. **While the app is
unfocused those point somewhere else, so everything you open lands in a document you are not
looking at. Nothing throws. Modals and notices simply never appear.** It looks exactly like the
plugin being broken.

The fix is `Emulation.setFocusEmulationEnabled` — but it only produces **one focus transition at
the moment it is enabled**, and Obsidian updates those globals from focus events rather than
recomputing them. Enabling it during startup is useless: the transition arrives before the
listener exists. So:

```js
// AFTER the app has finished loading, not before.
await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await session.evaluate(`window.activeWindow = window; window.activeDocument = document;
                        window.dispatchEvent(new FocusEvent('focus'));`);
```

Then assert `activeWindow === window` before driving anything. Focus emulation is preferable to
`Page.bringToFront`, which really does steal focus from the user's desktop.

**2. The trust dialog blocks plugin loading.** A vault that ships plugins opens in Restricted
mode behind "Do you trust the author of this vault?", and community plugins do not load until it
is answered. The confirm button **has no class at all** — only the decline button is marked:

```js
".modal.mod-trust-folder .modal-button-container button:not(.mod-cancel)"
```

Identify it that way, not by text, so it survives whatever language the UI is in.

**3. The UI may not be in English.** A README for the community directory should show an English
UI. Set it in the isolated profile and reload:

```js
localStorage.setItem('language', 'en');   // then Page.reload, then re-assert focus emulation
```

**4. `Runtime.evaluate` with `returnByValue` chokes on deep objects.** Returning an Obsidian
object gives `Object reference chain is too long (-32000)`. Always end evaluated expressions with
an explicit `return null` or a plain summary object.

### Settings is a separate window

In Obsidian 1.14 `app.setting.open()` opens Settings in **a window of its own**, which CDP lists
as another `page` target titled `Settings - <vault> - Obsidian <version>`. Nothing appears in the
main window's DOM, which is easy to mistake for "settings cannot be driven". Attach to that
target and drive it like any other page. Obsidian may create the window ahead of time and only
show it on `open()`, so match it **by title**, not by waiting for a new target. Older builds draw
a `.modal.mod-settings` in the main window instead; `openPluginSettings()` in `capture-lib.mjs`
handles both and selects the plugin's tab by clicking its entry, as a user would.

### Real input, not `element.click()`

`element.click()` is fine for buttons, but context menus, hover states and text fields only
behave as they do for a user when the browser generates the events. Use
`Input.dispatchMouseEvent` (with `button: "right"` for context menus) and `Input.insertText` for
typing — `mouseClick`, `hover`, `typeText` and `typeWithFrames` in `capture-lib.mjs`. Always find
the target by its **visible** bounding box: Obsidian keeps hidden copies of many views in the DOM,
and the first match is often one of them.

## Canned services instead of the network

A plugin that fetches feeds, calls an API or plays media should be recorded against fixtures,
not the live service: the demo is reproducible, shows exactly the content you chose, and leaks
nothing. `fixture-server.mjs` serves files or generated responses, and `hostResolverRules()`
produces a Chromium switch that sends made-up host names to it:

```js
const server = await startFixtureServer({ routes: { "/feed.xml": () => xml } });
await launchObsidian({ args: [hostResolverRules(["podcast-demo.example"], server.port)] });
```

No hosts-file edit and no root. What was learned getting this right:

- **Audio and video need HTTP Range.** Python's `http.server` and most quick static servers
  answer with a plain 200. Chromium then plays the file but `seekable` is empty and every seek is
  silently ignored, so "jump to 12:35" does nothing and nothing says why. The fixture server
  answers ranges with 206.
- **Use a host name, not `localhost`.** A plugin with SSRF protection (as it should have) refuses
  `localhost` and private addresses, so pointing it at `127.0.0.1` tests the guard, not the
  feature. Names under `.example` are reserved and never resolve to anything real.
- **The mapping covers everything Chromium fetches**: `requestUrl`, `<img>`, `<audio>`. It does
  not cover Node's own `http`/`https` modules, which a desktop plugin may use as a fallback.
- **`fetch()` from the renderer fails on CORS** (the page's origin is `app://obsidian.md`) unless
  the fixture sends CORS headers — the same thing the real service would have to do.
- `silentWav(seconds)` stands in for an episode or a song: it has the advertised duration, plays,
  seeks and downloads like the real thing, and needs no ffmpeg.

## Containers and CI

All of the above runs headless on Linux, as root, with no Obsidian preinstalled:

```bash
node fetch-obsidian.mjs                                   # once; cached in .obsidian-app/
PLUGIN_DIR=/path/to/plugin node examples/podcasts/record.mjs
```

What it takes: Node 22+, Python with Pillow, `Xvfb`, and outbound access to GitHub for the one
download. `curl` does that download because it honours `HTTPS_PROXY`, which Node's `fetch` does not
before Node 24. Six GIFs for a real plugin take about two minutes end to end.

`examples/podcasts/` is a complete worked example: fixtures, a demo vault with its own
`.obsidian` config (daily notes enabled), a reset between scenes, and one function per GIF.

---

## Capturing: states, not video

Capture **one screenshot per UI state** and give each its own duration, rather than recording.
A screencast gives you arbitrarily timed frames; staged states let each one be held long enough
to read, and the file ends up a fraction of the size. A menu that flashes for 40 ms is useless.

Typical result: 8 frames, 980×766, 11 seconds, ~860 KB.

```js
await cap.frame("consent", 2600);              // hold the dialog long enough to read
await cap.frame("click", 350, { cursor: { ...box, click: true } });
```

**Screenshots contain no mouse pointer.** For anything involving a click, composite a cursor
afterwards — `make-gif.py` draws an arrow plus a click ripple at coordinates taken from the real
element's bounding box. Position is real; the cursor is drawn. **Say this in the repo**, as the
distinction matters.

Encode with one shared palette across all frames, or the GIF shimmers as each frame picks its own.

## Verify while you are in there

The run that produces the demo is the cheapest chance to check the claims the README makes. Drive
the real UI and assert on real values:

- **Anti-copy**: perform a genuine drag with `Input.dispatchMouseEvent`, then read
  `window.getSelection().toString().length`. "82 characters with it off, 0 with it on" is a
  verification; "we disable selection" is a claim.
- **A second browser** hitting the public URL proves viewer counts, heartbeats and the rendered
  page as a visitor actually receives it, not as a local preview.
- **After teardown**, fetch the URL again and record what really happens. A stopped Cloudflare
  quick tunnel returns **502**, not the 404 people tend to write in their docs.
- **Headers and path control** on the live server, not just in unit tests.

Anything asserted in a submission checklist but never observed should be recorded as unverified.

---

## Runtime-only defect patterns worth checking

These all pass typecheck and lint, and all of them were real:

- **A guard on an undocumented internal that no longer exists** — the block never runs and the
  feature is silently dead. Enumerate what the object really has (`Object.keys(leaf)`) instead of
  trusting a hand-written `.d.ts`. Obsidian's tab header exposes `tabHeaderEl`,
  `tabHeaderInnerIconEl`, `tabHeaderInnerTitleEl`, `tabHeaderStatusContainerEl` — and
  `tabHeaderStatusContainerEl` is the right home for a per-tab indicator.
- **A modal whose promise never settles.** If a dialog resolves only from its buttons, Escape and
  the window close button leave the caller awaiting forever, with no error. Every modal that
  backs a promise needs `onClose` to report a decision if none was made.
- **DOM injected into Obsidian's own chrome is not cleaned up on unload.** Obsidian tears down
  ribbon icons and status bar items; it does not remove a child you appended to a tab header.
  Remove it explicitly in `onunload`.
- **Timers that work when idle.** A poll that walks every leaf every few seconds should return
  immediately when there is nothing to poll.
- **Rebuilding DOM on a timer** drops keyboard focus mid-interaction. Patch in place, and only
  when the value changed.
- **A loading indicator left behind on the empty path.** A render function that adds a spinner,
  then returns early with "No items yet", shows both at once. It can stay hidden for a long time
  if the spinner's CSS is itself broken.
- **Views that miss a bulk change.** "Delete all data" cleared the store, but the sidebar and the
  player kept showing the old queue until some unrelated event redrew them. A bulk operation
  needs an event that every open view listens to.
- **Layout that breaks only with enough data.** A search field in a flex row without
  `min-width: 0` cannot shrink, so the row overflows as soon as a long list adds a scrollbar.
  Capture with realistic amounts of data, not one item.
- **An internal scale leaking into the UI.** A speed slider stored as "rate × 100" displayed
  `100` for 1.0×, because Obsidian shows the slider's raw value. Use the unit the user thinks in.
- **Copy that only looks wrong on screen**: "1 episodes", a long title running off the panel
  edge, Title Case where Obsidian uses sentence case.

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

Nothing installed. Obsidian is already on the machine, and:

- **Node 22+** has a global `WebSocket`, so a Chrome DevTools Protocol client is ~100 lines with
  zero dependencies. No puppeteer.
- **Python with Pillow** encodes the GIF. Check first: `python -c "import PIL"`. If ffmpeg,
  ImageMagick and gifski are all absent — they usually are — Pillow is the way through.

## Bringing Obsidian up

```bash
Obsidian.exe --remote-debugging-port=9444 --user-data-dir=<throwaway>
```

`--user-data-dir` gives a completely isolated install: its own `obsidian.json` (write one listing
only the demo vault), its own localStorage, its own settings. **The user's real vault list,
plugins and settings are never touched.** Always use it.

Then `GET http://127.0.0.1:<port>/json/list`, take the `page` target, and open its
`webSocketDebuggerUrl`.

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

### What cannot be driven

`app.setting.open()` runs without error but never attaches its container to the DOM — no settings
modal, no tabs, and force-attaching does not build the tab list either. Real window focus does not
help. **Settings-tab screenshots have to be taken by hand.** Say so rather than shipping a stale
one.

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

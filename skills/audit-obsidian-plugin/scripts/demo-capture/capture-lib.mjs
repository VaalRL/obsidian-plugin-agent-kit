/**
 * Capture helpers shared by the demo recordings.
 *
 * Frames are deliberately taken one UI state at a time rather than as a
 * screencast: each state can then be held for as long as a reader needs to take
 * it in, which a raw recording cannot do, and the result is a fraction of the
 * size.
 */

import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { CdpSession, listTargets, sleep } from "./cdp.mjs";

export class Capture {
    constructor(session, { dir, width = 980, colors = 128 }) {
        this.session = session;
        this.dir = dir;
        this.width = width;
        this.colors = colors;
        this.frames = [];
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
    }

    /** Screenshots the current state and holds it for `ms` in the finished GIF. */
    async frame(label, ms = 900, { cursor = null, settle = 220 } = {}) {
        await sleep(settle); // let the change paint before photographing it
        const png = await this.session.screenshot();
        const file = `${String(this.frames.length).padStart(2, "0")}-${label}.png`;
        writeFileSync(path.join(this.dir, file), png);
        const entry = { file, ms };
        if (cursor) entry.cursor = cursor;
        this.frames.push(entry);
        console.log(`  frame ${file}  ${ms}ms  ${(png.length / 1024).toFixed(0)} KB`);
        return entry;
    }

    /** Repeats the previous frame, to hold a state longer without re-shooting. */
    hold(ms) {
        const last = this.frames.at(-1);
        if (!last) throw new Error("nothing to hold");
        this.frames.push({ ...last, ms });
    }

    write() {
        const manifest = { width: this.width, colors: this.colors, frames: this.frames };
        writeFileSync(
            path.join(this.dir, "manifest.json"),
            JSON.stringify(manifest, null, 2)
        );
        console.log(`  manifest: ${this.frames.length} frames`);
        return path.join(this.dir, "manifest.json");
    }
}

/** Centre of an element, in page coordinates, for placing the drawn cursor. */
export async function centreOf(session, selector) {
    const box = await session.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!box) throw new Error(`no element for ${selector}`);
    return box;
}

export async function click(session, selector) {
    const ok = await session.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.click();
        return true;
    })()`);
    if (!ok) throw new Error(`could not click ${selector}`);
}

/** Opens the command palette and types a query into it. */
export async function openPalette(session, query) {
    await session.evaluate(`app.commands.executeCommandById('command-palette:open')`);
    await sleep(700);
    await session.evaluate(`(() => {
        const input = document.querySelector('.prompt-input');
        if (!input) return false;
        input.value = ${JSON.stringify(query)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    })()`);
    await sleep(500);
}

export async function openNote(session, basename, { preview = true } = {}) {
    await session.evaluate(`(async () => {
        const file = app.vault.getMarkdownFiles().find(f => f.basename === ${JSON.stringify(basename)});
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(file);
        ${preview ? `await leaf.setViewState({ type: 'markdown', state: { mode: 'preview', file: file.path } });` : ""}
    })()`);
    await sleep(1800);
}

// --- Real input -------------------------------------------------------------
// Element.click() is enough for buttons, but menus, hover states, right-clicks
// and text fields only behave as they do for a user when the input comes from
// the browser itself. These dispatch it through CDP.

/**
 * Centre of the `index`-th visible element matching `selector`, optionally only
 * those whose trimmed text equals `text`. Hidden copies (other tabs, collapsed
 * panes) are skipped, which is what makes indexes stable.
 */
export async function pointOf(session, selector, { index = 0, text = null } = {}) {
    const point = await session.evaluate(`(() => {
        let els = [...document.querySelectorAll(${JSON.stringify(selector)})]
            .filter((el) => el.getClientRects().length > 0);
        const text = ${JSON.stringify(text)};
        if (text !== null) els = els.filter((el) => el.textContent.trim() === text);
        const el = els[${index}];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!point) throw new Error(`no visible element for ${selector}${text ? ` "${text}"` : ""} #${index}`);
    return point;
}

/** Waits for an element to become visible and returns its centre. */
export async function waitFor(session, selector, { text = null, index = 0, timeoutMs = 8000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            return await pointOf(session, selector, { text, index });
        } catch (error) {
            if (Date.now() > deadline) throw error;
            await sleep(150);
        }
    }
}

/** Polls an expression in the page until it is truthy, and returns its value. */
export async function waitUntil(session, expression, { timeoutMs = 10000, intervalMs = 150 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await session.evaluate(expression);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`timed out waiting for: ${expression}`);
        await sleep(intervalMs);
    }
}

export async function hover(session, point) {
    await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
}

/** A real mouse click at a point. `button: "right"` opens context menus. */
export async function mouseClick(session, point, { button = "left" } = {}) {
    await hover(session, point);
    await sleep(60);
    const event = { x: point.x, y: point.y, button, clickCount: 1 };
    await session.send("Input.dispatchMouseEvent", { type: "mousePressed", ...event });
    await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...event });
}

/** Types into the focused element as if from the keyboard (fires input events). */
export async function typeText(session, text) {
    await session.send("Input.insertText", { text });
}

/**
 * Types `text` into the field at `selector` a few characters at a time, taking a
 * frame after each step, so the GIF shows it being typed.
 */
export async function typeWithFrames(capture, selector, text, { step = 9, ms = 160, label = "typing" } = {}) {
    const session = capture.session;
    const at = await pointOf(session, selector);
    await mouseClick(session, at);
    for (let end = Math.min(step, text.length); ; end = Math.min(end + step, text.length)) {
        await session.evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            el.value = "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
        })()`);
        await typeText(session, text.slice(0, end));
        if (end === text.length) break;
        await capture.frame(`${label}-${end}`, ms, { cursor: at });
    }
    return at;
}

// --- Settings ---------------------------------------------------------------

/**
 * Opens Settings on the plugin's tab and returns a session for whichever page
 * shows it, plus a close() for it.
 *
 * Older Obsidian builds draw Settings as a modal inside the main window. Newer
 * ones (1.14+) open it in a window of its own, which CDP lists as a separate page
 * target titled "Settings - ...": attach to that one to screenshot it. Obsidian may
 * create that window ahead of time and only show it on open(), so the target can
 * exist before Settings is opened; it is matched by title, not by being new. Either way
 * the tab is selected by clicking its entry in the left column, as a user would.
 *
 * `tabName` is the plugin's display name (manifest.json `name`).
 */
export async function openPluginSettings(session, { port = 9444, tabName, timeoutMs = 10000 }) {
    await session.evaluate(`(() => { app.setting.open(); })()`);

    let target = session;
    let ownWindow = false;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const fresh = (await listTargets(port)).find(
            (t) => t.type === "page" && t.title.startsWith("Settings")
        );
        if (fresh) {
            target = await CdpSession.attach(fresh.webSocketDebuggerUrl);
            await target.send("Page.enable");
            await target.send("Runtime.enable");
            await target.send("Emulation.setFocusEmulationEnabled", { enabled: true });
            ownWindow = true;
            break;
        }
        if (await session.evaluate(`!!document.querySelector(".modal.mod-settings")`)) break;
        if (Date.now() > deadline) throw new Error("Settings never opened");
        await sleep(200);
    }

    const nav = await waitFor(target, ".vertical-tab-nav-item", { text: tabName, timeoutMs });
    await mouseClick(target, nav);
    await waitFor(target, ".vertical-tab-content .setting-item", { timeoutMs });
    await sleep(500);

    return {
        session: target,
        async close() {
            if (ownWindow) {
                await target.evaluate(`window.close()`).catch(() => {});
                target.close();
            } else {
                await session.evaluate(`app.setting.close()`);
            }
            await sleep(500);
        }
    };
}

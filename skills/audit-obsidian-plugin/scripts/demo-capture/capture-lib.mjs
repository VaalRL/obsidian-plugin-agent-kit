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
import { sleep } from "./cdp.mjs";

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

/** Waits for a live session and returns its public URL. */
export async function waitForTunnel(session, { timeoutMs = 180000, onProgress } = {}) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const state = await session.evaluate(`(() => {
            const mgr = app.plugins.plugins['note-wormhole'].wormholeManager;
            const ids = Array.from(mgr.sessions.keys());
            return {
                url: ids.length ? mgr.getPublicUrl(ids[0]) : null,
                notice: document.querySelector('.notice')?.textContent?.trim() ?? null
            };
        })()`);
        if (state.url) return state.url;
        if (onProgress && state.notice) onProgress(state.notice);
        await sleep(700);
    }
    throw new Error("tunnel never came up");
}

export async function stopAllSessions(session) {
    await session.evaluate(`(async () => {
        const mgr = app.plugins.plugins['note-wormhole']?.wormholeManager;
        if (!mgr) return;
        for (const id of Array.from(mgr.sessions.keys())) {
            try { await mgr.stopSharing(id); } catch (e) { /* already gone */ }
        }
    })()`);
}

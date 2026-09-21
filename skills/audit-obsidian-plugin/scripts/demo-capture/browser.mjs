/**
 * Headless Chromium driver for the reader's side of the demo.
 *
 * The shared page is captured in a real browser hitting the real public URL, so
 * what the GIF shows is what a visitor actually gets — not a local preview.
 */

import { spawn } from "child_process";
import { rmSync } from "fs";
import path from "path";
import { CdpSession, sleep, waitForPort } from "./cdp.mjs";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const HERE = import.meta.dirname;

export async function launchBrowser({ port = 9470, url = "about:blank", width = 900, height = 620 } = {}) {
    const profile = path.join(HERE, `browser-profile-${port}`);
    rmSync(profile, { recursive: true, force: true });

    const child = spawn(
        EDGE,
        [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`,
            "--headless=new",
            "--no-first-run",
            "--hide-scrollbars",
            `--window-size=${width},${height}`,
            url
        ],
        { stdio: "ignore", windowsHide: true }
    );

    const targets = await waitForPort(port, 30000);
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("browser exposed no page target");

    const session = await CdpSession.attach(page.webSocketDebuggerUrl);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await sleep(500);

    return { session, child };
}

export async function navigate(session, url) {
    await session.send("Page.navigate", { url });
    await sleep(2500);
}

/** Switches the emulated colour scheme, to show what `themeMode: auto` does. */
export async function setColorScheme(session, value) {
    await session.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value }]
    });
    await sleep(600);
}

/** Bounding box of an element in the page, for aiming a real drag at it. */
export async function boxOf(session, selector) {
    const box = await session.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
            left: Math.round(r.left), top: Math.round(r.top),
            right: Math.round(r.right), bottom: Math.round(r.bottom)
        };
    })()`);
    if (!box) throw new Error(`no element for ${selector}`);
    return box;
}

/**
 * Performs a genuine mouse drag across the element and reports how much text
 * ended up selected. With anti-copy on, the answer should be zero.
 */
export async function dragSelect(session, selector) {
    const box = await boxOf(session, selector);
    const y = Math.round((box.top + box.bottom) / 2);
    const from = { x: box.left + 4, y };
    const to = { x: box.right - 8, y };

    await session.evaluate(`window.getSelection().removeAllRanges()`);

    await session.send("Input.dispatchMouseEvent", {
        type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1
    });
    // Several moves: a single jump does not always extend a selection.
    for (let i = 1; i <= 6; i++) {
        await session.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: Math.round(from.x + ((to.x - from.x) * i) / 6),
            y: from.y,
            button: "left"
        });
        await sleep(40);
    }
    await session.send("Input.dispatchMouseEvent", {
        type: "mouseReleased", x: to.x, y: to.y, button: "left", clickCount: 1
    });
    await sleep(350);

    const selected = await session.evaluate(`window.getSelection().toString().length`);
    return { selected, from, to };
}

export async function closeBrowser(session, child) {
    session?.close();
    await sleep(200);
    child?.kill();
}

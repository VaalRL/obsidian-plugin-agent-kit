/**
 * Brings up the demo Obsidian in a known-good state for capturing:
 *   isolated user-data-dir  -> never touches the real install
 *   English UI              -> the README and the community list are English
 *   trust prompt dismissed  -> otherwise community plugins never load
 *   fixed window size       -> every GIF frame is the same dimensions
 */

import { spawn, spawnSync } from "child_process";
import { CdpSession, listTargets, sleep, waitForPort } from "./cdp.mjs";
import {
    buildDemoVault, obsidianNotFoundMessage, OBSIDIAN_EXE, PLUGIN_ID, USER_DATA, VAULT, WINDOW
} from "./setup-demo.mjs";

export { WINDOW };

/** The main workspace window (pop-outs and the settings window are separate targets). */
const isMainWindow = (t) => t.type === "page" && t.url.startsWith("app://obsidian.md/index.html");

/**
 * @param args  extra command-line switches for Obsidian, e.g. hostResolverRules()
 *              from fixture-server.mjs. OBSIDIAN_ARGS adds more from the environment.
 */
export async function launchObsidian({ port = 9444, rebuildVault = true, args: extraArgs = [] } = {}) {
    if (!OBSIDIAN_EXE) throw new Error(obsidianNotFoundMessage());
    if (rebuildVault) buildDemoVault();

    const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${USER_DATA}`, "--no-first-run"];
    // Chromium refuses to start as root without this (containers, CI runners)
    if (process.platform === "linux" && process.getuid?.() === 0) args.push("--no-sandbox");
    args.push(...extraArgs);
    if (process.env.OBSIDIAN_ARGS) args.push(...process.env.OBSIDIAN_ARGS.split(" ").filter(Boolean));

    const xvfb = startVirtualDisplay();
    const env = xvfb ? { ...process.env, DISPLAY: xvfb.display } : process.env;
    const child = spawn(OBSIDIAN_EXE, args, { stdio: "ignore", windowsHide: false, env });
    child.xvfb = xvfb?.process ?? null;

    await waitForPort(port, 45000);
    let page = null;
    for (let i = 0; i < 60 && !page; i++) {
        page = (await listTargets(port)).find(isMainWindow) ?? null;
        if (!page) await sleep(500);
    }
    if (!page) throw new Error("Obsidian exposed no workspace page target");

    const session = await CdpSession.attach(page.webSocketDebuggerUrl);
    await session.send("Page.enable");
    await session.send("Runtime.enable");

    // Obsidian supports pop-out windows, so it routes modals and notices through
    // its own `activeWindow` / `activeDocument` globals rather than `window` /
    // `document`. While the app is unfocused those point elsewhere and anything
    // opened lands in a document we are not looking at — modals and notices
    // silently never appear, with no error.
    //
    // Focus emulation makes the page behave as focused without actually taking
    // focus from the desktop, so the capture can run without hijacking the
    // user's screen. Page.bringToFront would work too, but it steals focus.
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await sleep(3500);

    // --- English UI ---------------------------------------------------------
    // Obsidian reads its display language from localStorage, which lives inside
    // the isolated user-data-dir, so this cannot leak into the real install.
    const language = await session.evaluate(`localStorage.getItem('language')`);
    if (language !== "en") {
        await session.evaluate(`localStorage.setItem('language', 'en')`);
        await session.send("Page.reload");
        await sleep(6000);
        // Focus emulation survives a reload, but re-assert it rather than assume.
        await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    }

    // --- Trust prompt + plugin load -----------------------------------------
    // A vault that ships plugins opens in Restricted mode behind a trust dialog.
    // Until it is answered, community plugins do not load at all.
    await trustAndWaitForPlugin(session);

    // --- Window size --------------------------------------------------------
    try {
        const { windowId } = await session.send("Browser.getWindowForTarget", {
            targetId: page.id
        });
        await session.send("Browser.setWindowBounds", {
            windowId,
            bounds: { windowState: "normal", ...WINDOW }
        });
        await sleep(800);
    } catch {
        // Not exposed on every build. setup-demo.mjs also writes the size into the
        // vault's window-state file, which Obsidian applies at startup.
    }

    await ensureActiveWindow(session);

    return { session, child, page };
}

/**
 * Makes Obsidian agree that the page we are attached to is the active one.
 *
 * Obsidian tracks `activeWindow` / `activeDocument` for its pop-out support, and
 * updates them from focus events — it does not recompute them on demand. So
 * enabling focus emulation before the app has finished booting is useless: the
 * one focus transition it generates arrives too early to be heard. This runs
 * after load, toggles emulation to produce a fresh transition, and then pins the
 * globals directly in case the listener still missed it.
 *
 * Without this, modals and notices are appended to a document we are not
 * looking at. Nothing throws; they simply never appear.
 */
async function ensureActiveWindow(session) {
    for (let attempt = 0; attempt < 3; attempt++) {
        await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
        await sleep(200);
        await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
        await sleep(400);

        const state = await session.evaluate(`(() => {
            try {
                window.activeWindow = window;
                window.activeDocument = document;
                window.dispatchEvent(new FocusEvent('focus'));
            } catch (e) { /* globals may be read-only; the focus event is the fallback */ }
            return {
                activeWindow: typeof activeWindow !== 'undefined' && activeWindow === window,
                activeDocument: typeof activeDocument !== 'undefined' && activeDocument === document,
                hasFocus: document.hasFocus()
            };
        })()`);

        if (state.activeWindow && state.activeDocument) return state;
        await sleep(600);
    }
    throw new Error(
        "Obsidian still reports another window as active; modals would be invisible"
    );
}

/**
 * Answers the trust prompt and waits for the plugin to come up.
 *
 * The confirm button on that dialog carries no class of its own — only the
 * decline button is marked, as `.mod-cancel` — so it is identified as "the
 * button in the trust modal that is not the cancel button". That keeps the
 * selector working whatever language the UI is in.
 */
const TRUST_BUTTON = ".modal.mod-trust-folder .modal-button-container button:not(.mod-cancel)";

async function trustAndWaitForPlugin(session, timeoutMs = 45000) {
    const deadline = Date.now() + timeoutMs;
    let trusted = false;

    while (Date.now() < deadline) {
        const state = await session.evaluate(`(() => {
            const app = window.app;
            const loaded = !!app?.plugins?.plugins?.[${JSON.stringify(PLUGIN_ID)}];
            return {
                loaded,
                language: localStorage.getItem('language'),
                trustButton: document.querySelector(${JSON.stringify(TRUST_BUTTON)})
                    ?.textContent?.trim() ?? null
            };
        })()`);

        if (state.loaded) {
            return { ...state, trusted };
        }

        if (state.trustButton) {
            await session.evaluate(`document.querySelector(${JSON.stringify(TRUST_BUTTON)}).click()`);
            trusted = true;
            await sleep(2500);
            continue;
        }

        await sleep(500);
    }
    throw new Error(`${PLUGIN_ID} never finished loading (is it built, and is the id in manifest.json right?)`);
}

/**
 * On Linux without a display (containers, CI, SSH), starts Xvfb so Obsidian has
 * somewhere to draw. Screenshots come from the renderer, so nothing needs to be
 * visible. Set DEMO_XVFB=0 to skip this and use DISPLAY as it is.
 */
function startVirtualDisplay() {
    if (process.platform !== "linux" || process.env.DISPLAY || process.env.DEMO_XVFB === "0") return null;
    if (spawnSync("which", ["Xvfb"]).status !== 0) {
        throw new Error("No DISPLAY and no Xvfb. Install Xvfb (e.g. apt-get install xvfb) or set DISPLAY.");
    }
    const display = `:${process.env.DEMO_XVFB_DISPLAY ?? 99}`;
    // A little larger than the window, so nothing is clipped at the screen edge
    const screen = `${WINDOW.width + 64}x${WINDOW.height + 64}x24`;
    const proc = spawn("Xvfb", [display, "-screen", "0", screen, "-nolisten", "tcp"], { stdio: "ignore" });
    return { display, process: proc };
}

export async function shutdown(session, child) {
    session?.close();
    await sleep(400);
    child?.kill();
    child?.xvfb?.kill();
    // On Windows the launcher process exits early and leaves the app running
    if (process.platform === "win32") {
        spawn("taskkill", ["/F", "/IM", "Obsidian.exe"], { stdio: "ignore" });
    }
    await sleep(1200);
}

export { VAULT, USER_DATA };

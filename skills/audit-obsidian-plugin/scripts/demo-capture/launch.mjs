/**
 * Brings up the demo Obsidian in a known-good state for capturing:
 *   isolated user-data-dir  -> never touches the real install
 *   English UI              -> the README and the community list are English
 *   trust prompt dismissed  -> otherwise community plugins never load
 *   fixed window size       -> every GIF frame is the same dimensions
 */

import { spawn } from "child_process";
import { CdpSession, sleep, waitForPort } from "./cdp.mjs";
import { buildDemoVault, OBSIDIAN_EXE, USER_DATA, VAULT } from "./setup-demo.mjs";

export const WINDOW = { width: 1180, height: 780 };

export async function launchObsidian({ port = 9444, rebuildVault = true } = {}) {
    if (rebuildVault) buildDemoVault();

    const child = spawn(
        OBSIDIAN_EXE,
        [`--remote-debugging-port=${port}`, `--user-data-dir=${USER_DATA}`, "--no-first-run"],
        { stdio: "ignore", windowsHide: false }
    );

    const targets = await waitForPort(port, 45000);
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("Obsidian exposed no page target");

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
        // Not fatal: the capture just uses whatever size the window came up at.
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
            const loaded = !!app?.plugins?.plugins?.['note-wormhole'];
            return {
                loaded,
                commands: Object.keys(app?.commands?.commands ?? {})
                    .filter(id => id.startsWith('note-wormhole')),
                language: localStorage.getItem('language'),
                trustButton: document.querySelector(${JSON.stringify(TRUST_BUTTON)})
                    ?.textContent?.trim() ?? null
            };
        })()`);

        if (state.loaded && state.commands.length >= 2) {
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
    throw new Error("note-wormhole never finished loading");
}

export async function shutdown(session, child) {
    session?.close();
    await sleep(400);
    child?.kill();
    spawn("taskkill", ["/F", "/IM", "Obsidian.exe"], { stdio: "ignore" });
    await sleep(1200);
}

export { VAULT, USER_DATA };

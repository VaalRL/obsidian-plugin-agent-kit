/**
 * Plugin-specific helpers from the Note Wormhole demo (https://github.com/VaalRL/obsidian-note-wormhole).
 *
 * They reach into that plugin's own objects, so they are not part of the generic
 * capture library. Keep helpers like these next to your own plugin's scenes.
 */

import { sleep } from "../cdp.mjs";

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

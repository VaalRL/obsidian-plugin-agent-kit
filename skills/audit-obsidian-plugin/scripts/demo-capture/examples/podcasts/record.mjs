/**
 * Records the README GIFs of the Podcasts plugin (https://github.com/VaalRL/obsidian-podcast),
 * end to end: canned feeds, a fresh demo vault, every scene, and the finished GIFs.
 *
 *   cd /path/to/obsidian-podcast && npm run build
 *   PLUGIN_DIR=/path/to/obsidian-podcast node record.mjs            # every scene
 *   PLUGIN_DIR=/path/to/obsidian-podcast node record.mjs play note  # just these
 *
 * Output lands in ./out (frames-<scene>/ and <scene>.gif). It is a worked example
 * of the capture library: copy it next to your own plugin and replace the scenes.
 * The calls into `app.plugins.plugins.podcasts` are this plugin's own API; yours
 * will differ.
 */

import { spawnSync } from "child_process";
import { mkdirSync } from "fs";
import path from "path";

const HERE = import.meta.dirname;
const KIT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");

// Read by setup-demo.mjs when it is imported, so set them first
process.env.DEMO_WIDTH ??= "1280";
process.env.DEMO_HEIGHT ??= "800";
process.env.DEMO_VAULT_SOURCE ??= path.join(HERE, "vault");
if (!process.env.PLUGIN_DIR) {
    console.error("Set PLUGIN_DIR to a built checkout of obsidian-podcast.");
    process.exit(1);
}

const { launchObsidian, shutdown } = await import(`${KIT}/launch.mjs`);
const { sleep } = await import(`${KIT}/cdp.mjs`);
const {
    Capture, pointOf, waitFor, waitUntil, hover, mouseClick, typeWithFrames, openPluginSettings
} = await import(`${KIT}/capture-lib.mjs`);
const { startFixtureServer, hostResolverRules } = await import(`${KIT}/fixture-server.mjs`);
const { FEEDS, HOST, routes } = await import("./fixtures.mjs");

const GIF = { width: 1024, colors: 160 };

// --- Plugin-specific helpers -------------------------------------------------

const plugin = (session, body) =>
    session.evaluate(`(async () => { const p = app.plugins.plugins.podcasts; ${body} })()`);

/** Wipes the plugin's data, subscribes to `feeds` and lays out the workspace. */
async function reset(session, feeds = []) {
    await plugin(session, `
        await p.playerController.stop();
        await p.getBackupService().deleteAllData();
        await p.getDownloadManager().clear();
        app.workspace.trigger('podcast:data-reset');
        for (const url of ${JSON.stringify(feeds)}) await p.getPodcastService().subscribe(url);
        // Daily notes left by an earlier scene
        for (const f of app.vault.getMarkdownFiles().filter(f => /^\\d{4}-\\d{2}-\\d{2}$/.test(f.basename))) {
            await app.vault.delete(f);
        }`);
    await session.evaluate(`(async () => {
        const main = app.workspace.getLeaf(false);
        await main.openFile(app.vault.getAbstractFileByPath('Listening notes.md'));
        const extra = [];
        app.workspace.iterateRootLeaves(l => { if (l !== main) extra.push(l); });
        extra.forEach(l => l.detach());
        const p = app.plugins.plugins.podcasts;
        app.workspace.detachLeavesOfType('podcast-sidebar-view');
        await p.activateSidebarView();
        await p.activatePlayerView();
        document.querySelectorAll('.notice').forEach(n => n.remove());
    })()`);
    await sleep(1500);
}

const hasNotice = (text) =>
    `[...document.querySelectorAll('.notice')].some(n => n.textContent.includes(${JSON.stringify(text)}))`;

// --- Scenes ------------------------------------------------------------------
// Each one records a single GIF. `at` is where the drawn cursor sits in a frame;
// `{ ...at, click: true }` adds the click ring.

const scenes = {
    async subscribe(session) {
        await reset(session, [FEEDS.science]);
        const cap = new Capture(session, { dir: path.join(OUT, "frames-subscribe"), ...GIF });

        await cap.frame("start", 1400);
        const plus = await pointOf(session, '[aria-label="Subscribe to podcast"]');
        await hover(session, plus);
        await cap.frame("hover-plus", 500, { cursor: plus });
        await mouseClick(session, plus);
        await waitFor(session, ".subscribe-modal-tab");
        await cap.frame("modal", 1200, { cursor: { ...plus, click: true } });

        const urlTab = await pointOf(session, ".subscribe-modal-tab", { text: "Add by URL" });
        await cap.frame("hover-url-tab", 450, { cursor: urlTab });
        await mouseClick(session, urlTab);
        await waitFor(session, ".subscribe-url-section input");
        const input = await typeWithFrames(cap, ".subscribe-url-section input", FEEDS.dev);
        await cap.frame("typed", 900, { cursor: input });

        const button = await pointOf(session, ".subscribe-url-section button.mod-cta");
        await cap.frame("hover-subscribe", 450, { cursor: button });
        await mouseClick(session, button);
        await cap.frame("subscribing", 500, { cursor: { ...button, click: true } });
        await waitUntil(session,
            `document.querySelectorAll('.podcast-item').length >= 2 && !document.querySelector('.subscribe-modal-tab')`);
        await sleep(600);
        await cap.frame("subscribed", 2600);
        return cap;
    },

    async "play-queue"(session) {
        await reset(session, [FEEDS.dev, FEEDS.science]);
        const cap = new Capture(session, { dir: path.join(OUT, "frames-play-queue"), ...GIF });

        await cap.frame("feeds", 1100);
        const show = await pointOf(session, ".podcast-item");
        await hover(session, show);
        await cap.frame("hover-show", 450, { cursor: show });
        await mouseClick(session, show);
        await waitFor(session, ".episode-item");
        await cap.frame("episodes", 1100, { cursor: { ...show, click: true } });

        const play = await pointOf(session, '.episode-item .episode-action-button[aria-label="Play"]');
        await hover(session, play);
        await cap.frame("hover-play", 450, { cursor: play });
        await mouseClick(session, play);
        await waitUntil(session, `app.plugins.plugins.podcasts.playerController.getState().status === 'playing'`);
        await sleep(1200);
        await cap.frame("playing", 1600, { cursor: { ...play, click: true } });

        // The fourth action button of the first episode row is "Add to playlist / queue"
        const add = await pointOf(session, ".episode-item .episode-action-button", { index: 3 });
        await hover(session, add);
        await cap.frame("hover-add", 450, { cursor: add });
        await mouseClick(session, add);
        await waitFor(session, ".menu .menu-item");
        await cap.frame("menu", 1100, { cursor: { ...add, click: true } });
        const queue = await pointOf(session, ".menu .menu-item", { text: "Default Queue" });
        await hover(session, queue);
        await cap.frame("hover-queue", 600, { cursor: queue });
        await mouseClick(session, queue);
        await sleep(1200);
        await cap.frame("queued", 1500, { cursor: { ...queue, click: true } });

        const next = await pointOf(session, '[aria-label="Next episode"]');
        await hover(session, next);
        await cap.frame("hover-next", 500, { cursor: next });
        await mouseClick(session, next);
        await sleep(2500);
        await cap.frame("next-playing", 2600, { cursor: { ...next, click: true } });
        await plugin(session, `await p.playerController.stop();`);
        return cap;
    },

    async download(session) {
        await reset(session, [FEEDS.dev, FEEDS.science]);
        await mouseClick(session, await pointOf(session, ".podcast-item"));
        await waitFor(session, ".episode-item");
        await sleep(500);
        const cap = new Capture(session, { dir: path.join(OUT, "frames-download"), ...GIF });

        await cap.frame("episodes", 1000);
        const episode = await pointOf(session, ".episode-item .episode-title", { index: 2 });
        await hover(session, episode);
        await cap.frame("hover", 450, { cursor: episode });
        await mouseClick(session, episode, { button: "right" });
        await waitFor(session, ".menu .menu-item");
        await cap.frame("menu", 1300, { cursor: { ...episode, click: true } });
        const item = await pointOf(session, ".menu .menu-item", { text: "Download for offline listening" });
        await hover(session, item);
        await cap.frame("hover-download", 700, { cursor: item });
        await mouseClick(session, item);
        await cap.frame("downloading", 600, { cursor: { ...item, click: true } });
        await waitUntil(session, hasNotice("Downloaded"), { timeoutMs: 30000 });
        await cap.frame("downloaded", 2400);
        return cap;
    },

    async "add-note"(session) {
        await reset(session, [FEEDS.dev, FEEDS.science]);
        await mouseClick(session, await pointOf(session, ".podcast-item"));
        await waitFor(session, ".episode-item");
        await mouseClick(session, await pointOf(session, '.episode-item .episode-action-button[aria-label="Play"]'));
        // Seeking before playback has really started is silently ignored
        await waitUntil(session, `app.plugins.plugins.podcasts.playerController.getState().status === 'playing'`);
        await sleep(400);
        await plugin(session, `await p.playerController.seek(754);`);
        await sleep(1200);
        await plugin(session, `await p.playerController.pause();`);
        await sleep(600);
        await session.evaluate(`(() => {
            document.querySelectorAll('.notice').forEach(n => n.remove());
            app.workspace.setActiveLeaf(app.workspace.getLeaf(false), { focus: true });
        })()`);
        await sleep(300);
        const cap = new Capture(session, { dir: path.join(OUT, "frames-add-note"), ...GIF });

        await cap.frame("paused", 1100);
        const noteButton = await pointOf(session, '[aria-label="Add note to daily note"]');
        await hover(session, noteButton);
        await cap.frame("hover-note", 500, { cursor: noteButton });
        await mouseClick(session, noteButton);
        await waitFor(session, ".add-note-buttons");
        await cap.frame("modal", 1200, { cursor: { ...noteButton, click: true } });

        const text = "Ship a checklist with every release: lint, tests, build, then try it in a real vault.";
        const field = await typeWithFrames(cap, ".add-note-input-container textarea", text, { step: 18, ms: 170 });
        await cap.frame("typed", 1000, { cursor: field });
        const add = await pointOf(session, ".add-note-buttons button.mod-cta");
        await hover(session, add);
        await cap.frame("hover-add", 450, { cursor: add });
        await mouseClick(session, add);
        await waitUntil(session, hasNotice("daily note"));
        await session.evaluate(`app.workspace.setActiveLeaf(app.workspace.getLeaf(false), { focus: true })`);
        await cap.frame("added", 1300, { cursor: { ...add, click: true } });

        const ribbon = await pointOf(session, `.side-dock-ribbon-action[aria-label="Open today's daily note"]`);
        await hover(session, ribbon);
        await cap.frame("hover-daily", 600, { cursor: ribbon });
        await mouseClick(session, ribbon);
        await sleep(1200);
        await session.evaluate(`(async () => {
            const leaf = app.workspace.getLeaf(false);
            const state = leaf.getViewState();
            await leaf.setViewState({ ...state, state: { ...state.state, mode: 'preview' } });
        })()`);
        await sleep(900);
        await cap.frame("daily-note", 3400, { cursor: { ...ribbon, click: true } });
        return cap;
    },

    async statistics(session) {
        await reset(session, [FEEDS.dev, FEEDS.science]);
        // A listening history to chart: [days ago, fraction listened] per episode
        const history = [[0, 0.35], [1, 1], [2, 1], [3, 1], [5, 1], [6, 0.6], [9, 1], [12, 1], [15, 1], [19, 1], [24, 0.8]];
        await plugin(session, `
            const shows = await p.getSubscriptionStore().getAllPodcasts();
            const episodes = shows.flatMap(show => show.episodes.map(e => ({ ...e, podcastId: show.id })));
            const history = ${JSON.stringify(history)};
            const store = p.getProgressStore();
            for (let i = 0; i < history.length && i < episodes.length; i++) {
                const [daysAgo, fraction] = history[i];
                const e = episodes[i];
                const at = new Date();
                at.setDate(at.getDate() - daysAgo);
                at.setHours(8 + i % 10, 15, 0, 0);
                await store.updateProgress({
                    episodeId: e.id, podcastId: e.podcastId, position: Math.round(e.duration * fraction),
                    duration: e.duration, lastPlayedAt: at, completed: fraction >= 1
                });
            }`);
        await session.evaluate(`app.commands.executeCommandById('podcasts:open-statistics')`);
        await sleep(2500);
        const cap = new Capture(session, { dir: path.join(OUT, "frames-statistics"), ...GIF, colors: 200 });

        await cap.frame("top", 3000);
        await session.evaluate(`(() => {
            const el = document.querySelector('.workspace-leaf.mod-active .view-content');
            el.scrollTo({ top: el.scrollHeight });
        })()`);
        await sleep(800);
        await cap.frame("bottom", 3000);
        return cap;
    },

    async settings(session) {
        await reset(session, [FEEDS.dev]);
        const settings = await openPluginSettings(session, { tabName: "Podcasts" });
        const cap = new Capture(settings.session, { dir: path.join(OUT, "frames-settings"), width: null, colors: 128 });

        await cap.frame("top", 2600);
        await settings.session.evaluate(`(() => {
            const pane = document.querySelector('.vertical-tab-content');
            const heading = [...pane.querySelectorAll('.setting-item-heading')]
                .find(h => h.textContent.startsWith('Daily note'));
            pane.scrollTop = heading.offsetTop - 20;
        })()`);
        await cap.frame("daily-note", 2600, { settle: 600 });
        await settings.close();
        return cap;
    }
};

// --- Run ---------------------------------------------------------------------

const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !scenes[name]);
if (unknown.length) {
    console.error(`Unknown scene(s): ${unknown.join(", ")}. Scenes: ${Object.keys(scenes).join(", ")}`);
    process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const server = await startFixtureServer({ routes: routes() });
const { session, child } = await launchObsidian({ args: [hostResolverRules([HOST], server.port)] });
const python = process.platform === "win32" ? "python" : "python3";

try {
    for (const name of wanted.length ? wanted : Object.keys(scenes)) {
        console.log(`scene: ${name}`);
        const capture = await scenes[name](session);
        const manifest = capture.write();
        const gif = path.join(OUT, `${name}.gif`);
        const made = spawnSync(python, [path.join(KIT, "make-gif.py"), manifest, gif], { stdio: "inherit" });
        if (made.status !== 0) throw new Error(`make-gif.py failed for ${name}`);
    }
} finally {
    await shutdown(session, child);
    await server.close();
}

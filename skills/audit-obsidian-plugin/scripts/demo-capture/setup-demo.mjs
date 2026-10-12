/**
 * Builds a throwaway Obsidian install for the README captures.
 *
 * Nothing here touches the user's real Obsidian: the app is pointed at its own
 * --user-data-dir, and that directory gets its own obsidian.json listing only
 * the demo vault. Their vault list, settings and plugins are untouched.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

const HERE = import.meta.dirname;
// Point these at the plugin under test. PROJECT must contain a built main.js,
// manifest.json and styles.css — run `npm run build` first.
const PROJECT = path.resolve(process.env.PLUGIN_DIR ?? process.cwd());
export const PLUGIN_ID = process.env.PLUGIN_ID ?? JSON.parse(
    readFileSync(path.join(PROJECT, "manifest.json"), "utf8")
).id;

export const VAULT = path.join(HERE, process.env.DEMO_VAULT_NAME ?? "Demo Vault");
export const USER_DATA = path.join(HERE, "obsidian-userdata");
export const OBSIDIAN_EXE = process.env.OBSIDIAN_EXE ?? findObsidian();

// Obsidian keeps each vault's window state in <user data>/<vault id>.json. Writing it
// is the reliable way to fix the window size: Browser.setWindowBounds is not exposed
// on the page target of every Obsidian build.
export const VAULT_ID = "claudedemovault01";
export const WINDOW = {
    width: Number(process.env.DEMO_WIDTH ?? 1180),
    height: Number(process.env.DEMO_HEIGHT ?? 780)
};

/** Where Obsidian usually lives on each platform; OBSIDIAN_EXE overrides it. */
function findObsidian() {
    const candidates = {
        win32: [
            path.join(process.env.LOCALAPPDATA ?? "", "Programs", "obsidian", "Obsidian.exe"),
            path.join(process.env.ProgramFiles ?? "C:/Program Files", "Obsidian", "Obsidian.exe")
        ],
        darwin: [
            "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
            path.join(os.homedir(), "Applications/Obsidian.app/Contents/MacOS/Obsidian")
        ],
        linux: [
            ...fetchedObsidian(),
            "/usr/bin/obsidian",
            "/opt/Obsidian/obsidian",
            "/snap/bin/obsidian",
            "/var/lib/flatpak/exports/bin/md.obsidian.Obsidian",
            path.join(os.homedir(), ".local/share/flatpak/exports/bin/md.obsidian.Obsidian")
        ]
    }[process.platform] ?? [];
    // null when nothing is found; launchObsidian() then explains how to set OBSIDIAN_EXE
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Copies downloaded by fetch-obsidian.mjs, newest version first. */
function fetchedObsidian() {
    const dir = path.join(HERE, ".obsidian-app");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((version) => path.join(dir, version, "squashfs-root", "obsidian"));
}

/** Explains how to point the scripts at Obsidian when it was not found. */
export function obsidianNotFoundMessage() {
    return "Obsidian was not found in its usual install locations. Set OBSIDIAN_EXE to the " +
        "Obsidian executable. On Linux, `node fetch-obsidian.mjs` downloads one.";
}

const NOTE = process.env.DEMO_NOTE ?? `> [!info] Shared read-only
> A demo note, rendered by the plugin under test.

## A heading

Body text, so the rendered page has something to show. Tables, code blocks and
callouts are worth including: they are what exercises the renderer.

| Column | Value |
| --- | --- |
| One | 1 |
| Two | 2 |

\`\`\`python
def example():
    return "code blocks render too"
\`\`\`

> A blockquote, for good measure.
`;

/**
 * Recreates the demo vault and the isolated Obsidian profile.
 * DEMO_VAULT_SOURCE, when set, is a folder whose contents are copied into the vault
 * instead of the built-in sample notes — use it for plugin-specific demo content.
 */
export function buildDemoVault() {
    rmSync(VAULT, { recursive: true, force: true });
    rmSync(USER_DATA, { recursive: true, force: true });

    // --- Vault contents -----------------------------------------------------
    mkdirSync(VAULT, { recursive: true });
    if (process.env.DEMO_VAULT_SOURCE) {
        cpSync(path.resolve(process.env.DEMO_VAULT_SOURCE), VAULT, { recursive: true });
    } else {
        writeFileSync(path.join(VAULT, "Q3 Platform Review.md"), NOTE, "utf8");
        writeFileSync(
            path.join(VAULT, "Meeting notes.md"),
            "# Meeting notes\n\nA second tab, so the launcher has something to list.\n",
            "utf8"
        );
    }

    // --- Vault config -------------------------------------------------------
    // Defaults only: a DEMO_VAULT_SOURCE that ships its own .obsidian/*.json keeps it
    // (e.g. to enable the daily-notes core plugin for a plugin that writes to it).
    const configDir = path.join(VAULT, ".obsidian");
    mkdirSync(configDir, { recursive: true });
    const writeDefault = (file, value) => {
        const target = path.join(configDir, file);
        if (!existsSync(target)) writeFileSync(target, JSON.stringify(value, null, 2));
    };

    writeDefault("app.json", { promptDelete: false, alwaysUpdateLinks: true });
    writeDefault("appearance.json", { theme: "obsidian", baseFontSize: 17 });
    writeDefault("core-plugins.json", ["file-explorer", "global-search", "switcher", "command-palette"]);

    // The plugin under test is always enabled, whatever the source listed
    const listFile = path.join(configDir, "community-plugins.json");
    const enabled = existsSync(listFile) ? JSON.parse(readFileSync(listFile, "utf8")) : [];
    if (!enabled.includes(PLUGIN_ID)) enabled.push(PLUGIN_ID);
    writeFileSync(listFile, JSON.stringify(enabled, null, 2));

    // --- Install the plugin under test --------------------------------------
    const pluginDir = path.join(configDir, "plugins", PLUGIN_ID);
    mkdirSync(pluginDir, { recursive: true });
    for (const file of ["main.js", "manifest.json", "styles.css"]) {
        cpSync(path.join(PROJECT, file), path.join(pluginDir, file));
    }

    // --- Isolated Obsidian user data ----------------------------------------
    // Obsidian keeps its vault list in obsidian.json inside userData. Writing our
    // own means the app opens the demo vault and never sees the real vault list.
    mkdirSync(USER_DATA, { recursive: true });
    // The path must be in the platform's native form: path.join already gives
    // backslashes on Windows and forward slashes elsewhere.
    writeFileSync(
        path.join(USER_DATA, "obsidian.json"),
        JSON.stringify({
            vaults: {
                [VAULT_ID]: { path: VAULT, ts: Date.now(), open: true }
            }
        })
    );
    writeFileSync(
        path.join(USER_DATA, `${VAULT_ID}.json`),
        JSON.stringify({ x: 0, y: 0, ...WINDOW, isMaximized: false, devTools: false, zoom: 0 })
    );

    return { VAULT, USER_DATA, pluginDir };
}

if (import.meta.filename === process.argv[1]) {
    const result = buildDemoVault();
    console.log("vault:      ", result.VAULT);
    console.log("user data:  ", result.USER_DATA);
    console.log("plugin dir: ", result.pluginDir);
    console.log("plugin id:  ", PLUGIN_ID);
    console.log("obsidian:   ", OBSIDIAN_EXE ?? obsidianNotFoundMessage());
}

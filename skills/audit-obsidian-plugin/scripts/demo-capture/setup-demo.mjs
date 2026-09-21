/**
 * Builds a throwaway Obsidian install for the README captures.
 *
 * Nothing here touches the user's real Obsidian: the app is pointed at its own
 * --user-data-dir, and that directory gets its own obsidian.json listing only
 * the demo vault. Their vault list, settings and plugins are untouched.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";

const HERE = import.meta.dirname;
// Point these at the plugin under test. PROJECT must contain a built main.js,
// manifest.json and styles.css — run `npm run build` first.
const PROJECT = process.env.PLUGIN_DIR ?? process.cwd();
const PLUGIN_ID = process.env.PLUGIN_ID ?? JSON.parse(
    readFileSync(path.join(PROJECT, "manifest.json"), "utf8")
).id;

export const VAULT = path.join(HERE, process.env.DEMO_VAULT_NAME ?? "Demo Vault");
export const USER_DATA = path.join(HERE, "obsidian-userdata");
export const OBSIDIAN_EXE =
    process.env.OBSIDIAN_EXE ??
    (process.platform === "win32"
        ? path.join(process.env.LOCALAPPDATA ?? "", "Programs", "obsidian", "Obsidian.exe")
        : process.platform === "darwin"
            ? "/Applications/Obsidian.app/Contents/MacOS/Obsidian"
            : "/usr/bin/obsidian");

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

export function buildDemoVault() {
    rmSync(VAULT, { recursive: true, force: true });
    rmSync(USER_DATA, { recursive: true, force: true });

    // --- Vault contents -----------------------------------------------------
    mkdirSync(VAULT, { recursive: true });
    writeFileSync(path.join(VAULT, "Q3 Platform Review.md"), NOTE, "utf8");
    writeFileSync(
        path.join(VAULT, "Meeting notes.md"),
        "# Meeting notes\n\nA second tab, so the launcher has something to list.\n",
        "utf8"
    );

    // --- Vault config -------------------------------------------------------
    const configDir = path.join(VAULT, ".obsidian");
    mkdirSync(configDir, { recursive: true });

    writeFileSync(
        path.join(configDir, "app.json"),
        JSON.stringify({ promptDelete: false, alwaysUpdateLinks: true }, null, 2)
    );
    writeFileSync(
        path.join(configDir, "appearance.json"),
        JSON.stringify({ theme: "obsidian", baseFontSize: 17 }, null, 2)
    );
    writeFileSync(
        path.join(configDir, "core-plugins.json"),
        JSON.stringify(["file-explorer", "global-search", "switcher", "command-palette"], null, 2)
    );
    writeFileSync(
        path.join(configDir, "community-plugins.json"),
        JSON.stringify([PLUGIN_ID], null, 2)
    );

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
    writeFileSync(
        path.join(USER_DATA, "obsidian.json"),
        JSON.stringify({
            vaults: {
                claudedemovault01: { path: VAULT.replace(/\//g, "\\"), ts: Date.now(), open: true }
            }
        })
    );

    return { VAULT, USER_DATA, pluginDir };
}

if (import.meta.filename === process.argv[1]) {
    const result = buildDemoVault();
    console.log("vault:      ", result.VAULT);
    console.log("user data:  ", result.USER_DATA);
    console.log("plugin dir: ", result.pluginDir);
}

/**
 * Downloads the Obsidian Linux AppImage and extracts it, for machines that do not
 * have Obsidian installed: containers, CI runners, cloud sessions.
 *
 *   node fetch-obsidian.mjs            # latest version
 *   OBSIDIAN_VERSION=1.14.4 node fetch-obsidian.mjs
 *
 * Prints the path of the extracted `obsidian` binary; pass it as OBSIDIAN_EXE.
 * Uses curl, which honours HTTPS_PROXY (Node's fetch does not, before Node 24).
 * Linux x64 only: on Windows and macOS install Obsidian normally.
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import path from "path";

const HERE = import.meta.dirname;
const APP_DIR = path.join(HERE, ".obsidian-app");
const RELEASES = "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/desktop-releases.json";

function curl(args) {
    return execFileSync("curl", ["--fail", "--silent", "--show-error", "--location", ...args], {
        maxBuffer: 1024 * 1024
    });
}

export function latestVersion() {
    return JSON.parse(curl([RELEASES]).toString("utf8")).latestVersion;
}

/** Returns the path of the extracted binary, downloading only when it is missing. */
export function fetchObsidian(version = process.env.OBSIDIAN_VERSION ?? latestVersion()) {
    if (process.platform !== "linux" || process.arch !== "x64") {
        throw new Error("fetch-obsidian.mjs downloads the Linux x64 AppImage; install Obsidian normally elsewhere.");
    }

    const dir = path.join(APP_DIR, version);
    const binary = path.join(dir, "squashfs-root", "obsidian");
    if (existsSync(binary)) return binary;

    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const appImage = path.join(dir, `Obsidian-${version}.AppImage`);
    const url = `https://github.com/obsidianmd/obsidian-releases/releases/download/v${version}/Obsidian-${version}.AppImage`;

    console.error(`Downloading Obsidian ${version}...`);
    curl(["--output", appImage, url]);
    execFileSync("chmod", ["+x", appImage]);

    // Extracting avoids needing FUSE, which containers rarely have
    execFileSync(appImage, ["--appimage-extract"], { cwd: dir, stdio: "ignore" });
    rmSync(appImage);

    if (!existsSync(binary)) throw new Error(`Extraction did not produce ${binary}`);
    return binary;
}

if (import.meta.filename === process.argv[1]) {
    console.log(fetchObsidian());
}

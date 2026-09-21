/**
 * Checks manifest.json's minAppVersion against the Obsidian APIs the plugin
 * actually calls.
 *
 * Errs towards silence: it reports a name only when every declaration carrying
 * that name is newer than the declared minAppVersion. A name shared between an
 * old API and a new one is not reported, because the call site cannot be
 * attributed by name alone.
 *
 * The directory's scan rejects a submission with `obsidianmd/no-unsupported-api`
 * when the code uses an API newer than the declared minAppVersion. That is an
 * error, not a warning, and it is trivially avoidable — obsidian.d.ts carries
 * `@since` annotations, so the answer is sitting in node_modules.
 *
 * Run from the plugin root, after `npm install`:
 *     node check-api-versions.mjs
 *
 * This is a heuristic, and says so. It matches call sites by method name, which
 * cannot distinguish `map.get(...)` from an Obsidian `get(...)`. Names that
 * collide with JavaScript, DOM or Node built-ins are therefore skipped, and
 * every remaining hit is reported with file:line so it can be confirmed by eye.
 * A name used on both an Obsidian object and a built-in will still need a human.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";

const root = process.argv[2] ?? process.cwd();
const dtsPath = path.join(root, "node_modules", "obsidian", "obsidian.d.ts");
const manifestPath = path.join(root, "manifest.json");

if (!existsSync(dtsPath)) {
    console.error(`No obsidian.d.ts at ${dtsPath} — run npm install first.`);
    process.exit(2);
}
if (!existsSync(manifestPath)) {
    console.error(`No manifest.json at ${manifestPath} — is this a plugin root?`);
    process.exit(2);
}

/**
 * Names that exist on Obsidian types but also on things every codebase uses.
 * Matching these by name produces confident nonsense — an early version of this
 * check reported a required version of 1.13.1 purely from Array.filter,
 * Map.get and String.includes.
 */
const AMBIGUOUS = new Set([
    "get", "set", "add", "delete", "clear", "has", "entries", "keys", "values",
    "filter", "map", "find", "includes", "match", "replace", "split", "slice",
    "then", "catch", "finally", "push", "pop", "join", "sort", "forEach",
    "toString", "valueOf", "constructor", "call", "apply", "bind",
    "remove", "hide", "show", "render", "display", "settings", "setValue",
    "addClass", "removeClass", "toggleClass", "append", "prepend", "empty",
    "on", "off", "once", "emit", "close", "open", "read", "write", "start", "stop"
]);

const dts = readFileSync(dtsPath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// --- every documented member that carries an @since ------------------------
const sinceOf = new Map();
for (const m of dts.matchAll(/\/\*\*([\s\S]*?)\*\/\s*\n\s*([^\n;{]+)/g)) {
    const since = /@since\s+([\d.]+)/.exec(m[1]);
    if (!since) continue;
    const name = /(?:function\s+|readonly\s+|abstract\s+|static\s+)?([A-Za-z_]\w*)\s*[(<:?]/.exec(m[2].trim());
    if (!name || AMBIGUOUS.has(name[1])) continue;

    // Keep the OLDEST @since for a name, not the newest. The same method name
    // appears on several classes and in overloads — Menu.addItem is ancient
    // while something else called addItem may be recent. A call site can only be
    // proven unsupported when EVERY declaration of that name is too new;
    // otherwise the call might be the old one, and flagging it is a false alarm.
    const prev = sinceOf.get(name[1]);
    if (!prev || cmp(since[1], prev) < 0) sinceOf.set(name[1], since[1]);
}

function cmp(a, b) {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) return d;
    }
    return 0;
}

// --- call sites in the plugin's own source ---------------------------------
function sources(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "test-build" || entry.startsWith(".")) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
    }
    return out;
}

const hits = [];
for (const file of sources(root)) {
    const rel = path.relative(root, file);
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // skip comments
        for (const [name, since] of sinceOf) {
            if (new RegExp(`[.\\s(]${name}\\s*\\(`).test(line)) {
                hits.push({ name, since, where: `${rel}:${i + 1}` });
            }
        }
    });
}

// --- report ----------------------------------------------------------------
const declared = manifest.minAppVersion ?? "0.0.0";
const byName = new Map();
for (const h of hits) {
    if (!byName.has(h.name)) byName.set(h.name, { since: h.since, where: [] });
    byName.get(h.name).where.push(h.where);
}

const tooNew = [...byName.entries()].filter(([, v]) => cmp(v.since, declared) > 0);
const sorted = [...byName.entries()].sort((a, b) => cmp(b[1].since, a[1].since));

console.log(`manifest.json declares minAppVersion ${declared}\n`);

if (sorted.length) {
    console.log("Obsidian APIs called, by the version that introduced them:");
    for (const [name, v] of sorted.slice(0, 15)) {
        const flag = cmp(v.since, declared) > 0 ? "  <-- TOO NEW" : "";
        console.log(`  ${v.since.padEnd(9)} ${name}${flag}`);
    }
    if (sorted.length > 15) console.log(`  ... and ${sorted.length - 15} older`);
}

if (tooNew.length === 0) {
    console.log(`\nOK: nothing calls an API newer than ${declared}.`);
    process.exit(0);
}

const required = tooNew.reduce((hi, [, v]) => (cmp(v.since, hi) > 0 ? v.since : hi), declared);
console.log(`\nERROR: ${tooNew.length} API(s) newer than the declared minAppVersion.\n`);
for (const [name, v] of tooNew) {
    console.log(`  ${name} — @since ${v.since}`);
    for (const w of v.where.slice(0, 6)) console.log(`      ${w}`);
    if (v.where.length > 6) console.log(`      ... and ${v.where.length - 6} more`);
}
console.log(`\nSet minAppVersion to ${required}, or stop using those APIs.`);
console.log("Confirm each site above before changing it — this matches by name.");
process.exit(1);

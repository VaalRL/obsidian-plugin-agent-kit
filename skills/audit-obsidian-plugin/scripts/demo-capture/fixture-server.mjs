/**
 * A local stand-in for the services a plugin talks to, so a demo never depends
 * on (or leaks into) the real network: feeds, APIs, images, audio.
 *
 *   const server = await startFixtureServer({ root: "fixtures", routes: { "/api/x": () => ({ ok: 1 }) } });
 *   await launchObsidian({ args: [hostResolverRules(["demo.example"], server.port)] });
 *   // the plugin can now fetch http://demo.example/... and gets answers from here
 *
 * Every response supports HTTP Range. Audio and video elements need it: without
 * 206 responses Chromium plays the file but cannot seek, and nothing says why.
 *
 * Zero dependencies.
 */

import { existsSync, readFileSync, statSync } from "fs";
import http from "http";
import path from "path";

const TYPES = {
    ".xml": "application/rss+xml; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4"
};

const typeOf = (name) => TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";

/**
 * @param root    folder served as static files (optional)
 * @param routes  { "/path": (url) => body } — body is a Buffer, a string, a plain
 *                object (sent as JSON) or { body, type, status }. Checked before root.
 * @param port    0 picks a free port; read it back from the result
 */
export function startFixtureServer({ root = null, routes = {}, port = 0, log = false } = {}) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, "http://fixture");
        if (log) console.log(`  [fixture] ${req.method} ${url.pathname}${req.headers.range ? ` ${req.headers.range}` : ""}`);

        let reply = null;
        try {
            reply = resolve(url);
        } catch (error) {
            res.writeHead(500, { "Content-Type": "text/plain" }).end(String(error?.stack ?? error));
            return;
        }
        if (!reply) {
            res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
            return;
        }
        send(req, res, reply);
    });

    function resolve(url) {
        const route = routes[url.pathname];
        if (route) {
            const out = route(url);
            if (Buffer.isBuffer(out)) return { body: out, type: typeOf(url.pathname) };
            if (typeof out === "string") return { body: Buffer.from(out), type: typeOf(url.pathname) };
            if (out && "body" in out) {
                return { ...out, body: Buffer.isBuffer(out.body) ? out.body : Buffer.from(String(out.body)) };
            }
            return { body: Buffer.from(JSON.stringify(out)), type: TYPES[".json"] };
        }
        if (!root) return null;
        const base = path.resolve(root);
        const file = path.resolve(base, "." + decodeURIComponent(url.pathname));
        // Never serve anything outside root
        if (!file.startsWith(base + path.sep) || !existsSync(file) || !statSync(file).isFile()) return null;
        return { body: readFileSync(file), type: typeOf(file) };
    }

    return new Promise((ready, fail) => {
        server.once("error", fail);
        server.listen(port, "127.0.0.1", () => {
            ready({
                port: server.address().port,
                close: () => new Promise((done) => server.close(done))
            });
        });
    });
}

function send(req, res, { body, type, status = 200 }) {
    const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");

    if (range && status === 200 && (range[1] || range[2])) {
        const size = body.length;
        let start, end;
        if (range[1]) {
            start = Number(range[1]);
            end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        } else {
            // "bytes=-N": the last N bytes
            start = Math.max(0, size - Number(range[2]));
            end = size - 1;
        }
        if (start >= size || start > end) {
            res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` }).end();
            return;
        }
        res.writeHead(206, {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": end - start + 1
        });
        res.end(req.method === "HEAD" ? undefined : body.subarray(start, end + 1));
        return;
    }

    res.writeHead(status, { ...headers, "Content-Length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
}

/**
 * Chromium switch that sends the given host names to the fixture server, for
 * every request the app makes: fetch, requestUrl, <img>, <audio>. Pass it to
 * launchObsidian({ args }). No hosts-file edits, no root.
 *
 * Use made-up names under .example (reserved, never real). Requests made with
 * Node's own http module bypass Chromium and are not redirected.
 */
export function hostResolverRules(hosts, port) {
    const rules = hosts.map((host) => `MAP ${host} 127.0.0.1:${port}`).join(", ");
    return `--host-resolver-rules=${rules}`;
}

/**
 * A silent WAV of the given length: a stand-in episode, song or recording that
 * plays, seeks and reports its duration like the real thing. 8 kHz 8-bit mono
 * keeps an hour under 30 MB.
 */
export function silentWav(seconds, { sampleRate = 8000 } = {}) {
    const samples = Math.round(seconds * sampleRate);
    const wav = Buffer.alloc(44 + samples, 0x80); // 0x80 is silence in unsigned 8-bit PCM
    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + samples, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); // fmt chunk size
    wav.writeUInt16LE(1, 20); // PCM
    wav.writeUInt16LE(1, 22); // mono
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate, 28); // byte rate
    wav.writeUInt16LE(1, 32); // block align
    wav.writeUInt16LE(8, 34); // bits per sample
    wav.write("data", 36);
    wav.writeUInt32LE(samples, 40);
    return wav;
}

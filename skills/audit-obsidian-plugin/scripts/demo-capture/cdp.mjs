/**
 * Minimal Chrome DevTools Protocol client.
 *
 * Zero dependencies: Node 22+ ships a global WebSocket, and the CDP handshake is
 * just HTTP GET /json/list followed by a WebSocket carrying JSON-RPC.
 *
 * Works against any Chromium target, including an Electron app (Obsidian)
 * launched with --remote-debugging-port.
 */

export async function listTargets(port) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!res.ok) throw new Error(`CDP /json/list returned HTTP ${res.status}`);
    return res.json();
}

/** Waits for the debugging port to answer, so we don't race app startup. */
export async function waitForPort(port, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;

    while (Date.now() < deadline) {
        try {
            return await listTargets(port);
        } catch (error) {
            lastError = error;
            await new Promise((r) => setTimeout(r, 300));
        }
    }
    throw new Error(`Debugging port ${port} never answered: ${lastError?.message}`);
}

export class CdpSession {
    #ws;
    #nextId = 1;
    #pending = new Map();
    #listeners = new Map();

    static async attach(webSocketDebuggerUrl) {
        const session = new CdpSession();
        await session.#connect(webSocketDebuggerUrl);
        return session;
    }

    #connect(url) {
        return new Promise((resolve, reject) => {
            this.#ws = new WebSocket(url);
            this.#ws.addEventListener("open", () => resolve());
            this.#ws.addEventListener("error", (event) =>
                reject(new Error(`WebSocket error: ${event.message ?? "unknown"}`))
            );
            this.#ws.addEventListener("message", (event) => this.#onMessage(event.data));
        });
    }

    #onMessage(raw) {
        const message = JSON.parse(raw);

        if (message.id !== undefined) {
            const entry = this.#pending.get(message.id);
            if (!entry) return;
            this.#pending.delete(message.id);
            if (message.error) {
                entry.reject(new Error(`${message.error.message} (${message.error.code})`));
            } else {
                entry.resolve(message.result);
            }
            return;
        }

        const handlers = this.#listeners.get(message.method);
        if (handlers) {
            for (const handler of handlers) handler(message.params);
        }
    }

    send(method, params = {}) {
        const id = this.#nextId++;
        return new Promise((resolve, reject) => {
            this.#pending.set(id, { resolve, reject });
            this.#ws.send(JSON.stringify({ id, method, params }));
        });
    }

    on(method, handler) {
        if (!this.#listeners.has(method)) this.#listeners.set(method, []);
        this.#listeners.get(method).push(handler);
    }

    /** Evaluates an expression in the page and returns its value. */
    async evaluate(expression, { awaitPromise = true } = {}) {
        const result = await this.send("Runtime.evaluate", {
            expression,
            awaitPromise,
            returnByValue: true
        });
        if (result.exceptionDetails) {
            throw new Error(
                `Evaluate failed: ${result.exceptionDetails.text} ${
                    result.exceptionDetails.exception?.description ?? ""
                }`
            );
        }
        return result.result.value;
    }

    /** Returns a PNG screenshot of the page as a Buffer. */
    async screenshot({ format = "png", clip } = {}) {
        const params = { format, captureBeyondViewport: false };
        if (clip) params.clip = { ...clip, scale: 1 };
        const { data } = await this.send("Page.captureScreenshot", params);
        return Buffer.from(data, "base64");
    }

    close() {
        this.#ws?.close();
    }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

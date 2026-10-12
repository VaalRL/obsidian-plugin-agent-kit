/**
 * Two made-up podcasts, served from http://podcast-demo.example by the fixture
 * server: RSS feeds, SVG covers and silent WAV episodes of the advertised length.
 * Nothing touches the real network, and the plugin's own feed parser, player and
 * downloader run unmodified against it.
 */

import { silentWav } from "../../fixture-server.mjs";

export const HOST = "podcast-demo.example";
const BASE = `http://${HOST}`;

// [title, description, days ago, seconds]
const SHOWS = {
    dev: {
        title: "Dev Talk",
        description: "Weekly conversations about building software.",
        colors: ["#5b3cc4", "#b14ad6"],
        episodes: [
            ["Shipping your first plugin", "Release checklists, versioning and reviews.", 1, 2580],
            ["Testing without the network", "Mocks, fakes and the bugs they hide.", 8, 2310],
            ["Notes that write themselves", "Linking listening to your knowledge base.", 15, 1960],
            ["The case for plain text", "Why your notes should outlive your apps.", 22, 2740],
            ["Refactoring in public", "Changing code while people depend on it.", 29, 2150],
            ["Small tools, sharp edges", "Building utilities that do one thing well.", 36, 1820]
        ]
    },
    science: {
        title: "Tiny Science",
        description: "Ten-minute answers to everyday questions.",
        colors: ["#0f8a6c", "#3cc4a0"],
        episodes: [
            ["Why the sky is blue", "Rayleigh scattering in plain words.", 2, 540],
            ["How bees find home", "Polarised light and a sun compass.", 5, 610],
            ["The smell of rain", "Petrichor, geosmin and thunderstorms.", 9, 480],
            ["Why ice floats", "Hydrogen bonds and a very lucky planet.", 12, 560],
            ["Counting with fingers", "How babies and crows learn numbers.", 16, 590]
        ]
    }
};

export const FEEDS = Object.fromEntries(Object.keys(SHOWS).map((id) => [id, `${BASE}/${id}.xml`]));

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function feed(id) {
    const show = SHOWS[id];
    const items = show.episodes.map(([title, description, daysAgo, seconds], i) => {
        const date = new Date(Date.now() - daysAgo * 86400000).toUTCString();
        return `<item><title>${escape(title)}</title><description>${escape(description)}</description>
<guid>${id}-${i}</guid><pubDate>${date}</pubDate>
<enclosure url="${BASE}/${id}-${i}.wav" type="audio/wav" length="${44 + seconds * 8000}"/>
<itunes:duration>${seconds}</itunes:duration></item>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>${escape(show.title)}</title><link>${BASE}</link><description>${escape(show.description)}</description>
<language>en</language><itunes:author>Demo Studio</itunes:author><itunes:image href="${BASE}/${id}.svg"/>
${items.join("\n")}
</channel></rss>`;
}

function cover(id) {
    const { title, colors } = SHOWS[id];
    const lines = title.split(" ");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
<rect width="300" height="300" rx="24" fill="url(#g)"/>
<circle cx="150" cy="112" r="40" fill="none" stroke="#fff" stroke-width="10" opacity="0.9"/>
${lines.map((line, i) => `<text x="150" y="${205 + i * 46}" font-family="sans-serif" font-size="42" font-weight="700" fill="#fff" text-anchor="middle">${escape(line)}</text>`).join("\n")}
</svg>`;
}

/** Routes for startFixtureServer(). Audio is generated once per episode and reused. */
export function routes() {
    const table = {};
    const audio = new Map();
    for (const [id, show] of Object.entries(SHOWS)) {
        table[`/${id}.xml`] = () => feed(id);
        table[`/${id}.svg`] = () => cover(id);
        show.episodes.forEach(([, , , seconds], i) => {
            const file = `/${id}-${i}.wav`;
            table[file] = () => {
                if (!audio.has(file)) audio.set(file, silentWav(seconds));
                return audio.get(file);
            };
        });
    }
    return table;
}

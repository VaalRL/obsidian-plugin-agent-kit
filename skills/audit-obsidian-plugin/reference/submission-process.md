# Submission: process, policies, and precedent

Verified against the official sources in September 2026. The process changed; a lot of
third-party advice still describes the old one.

---

## The process changed — do not open a pull request

**Plugins are no longer submitted by opening a PR against `obsidianmd/obsidian-releases` and
editing `community-plugins.json`.** That repository is now a read-only registry; its README
points at the docs. Any guide, checklist or memory that says otherwise is stale.

The current process:

1. The repository must be **public**, with `README.md`, `LICENSE` and `manifest.json` in the root.
2. Create a **GitHub release** whose tag matches `manifest.json`'s `version` **exactly**, with
   `main.js`, `manifest.json` and `styles.css` attached as individual binary assets (not a zip).
3. Sign in at **[community.obsidian.md](https://community.obsidian.md)** with an **Obsidian
   account** (not a GitHub account), **link the GitHub account** so the directory can verify
   repository ownership, then add the plugin.

Two consequences worth stating to the user up front:

- **The directory reads `manifest.json` from the HEAD of the repository's default branch.** Work
  sitting on a feature branch will not be seen. Merge to the default branch before submitting.
- **The final step cannot be automated.** It is a web form behind an Obsidian account login;
  there is no API or CLI. Everything up to and including publishing the release can be driven
  with `gh`; the submission itself is the user's to do.

### Automated review is live

Every submitted version is automatically scanned for code quality, security vulnerabilities and
malware, and the result appears as a safety scorecard on the plugin's directory page. A new
submission must pass before it is listed at all. A published plugin that later fails is **removed
from search within 24 hours**. Obsidian has said scorecards will grow to include disclosures,
privacy labels and artifact attestation.

This changes the risk calculus for anything that looks like fetching or executing code at
runtime: it is no longer only a human reviewer's judgement.

---

## Developer policies

Source: `en/Community directory/Developer policies.md` in `obsidianmd/obsidian-developer-docs`.
Fetch it with `gh api` rather than WebFetch — the rendered docs site returns 404 for this path.

### Not allowed

> - Obfuscate code to hide its purpose.
> - Insert dynamic ads that are loaded over the internet.
> - Insert static ads outside a plugin's own interface.
> - Include client-side telemetry.
> - **Install or update themselves or their dependencies.**
> - Themes may not load assets from the network.

**The dependency line is the one that catches real plugins.** A plugin that downloads a helper
binary, a model file, or a CLI it shells out to is installing a dependency. Pinning the version,
verifying a SHA-256, restricting hosts and asking for consent make the download *safe*; they do
not make it *permitted*. See **Precedent** below for how this has actually been applied.

### Disclosures — allowed only if clearly indicated in the README

> - Payment is required for full access.
> - An account is required for full access.
> - **Network use.** Clearly explain which remote services are used and why they're needed.
> - **Accessing files outside of Obsidian vaults.** Clearly explain why this is needed.
> - Static ads within the plugin's own interface.
> - Server-side telemetry, with a link to a privacy policy.
> - Closed source code — case by case.

The "files outside the vault" disclosure is easy to miss. A plugin that searches `PATH` and
`/usr/local/bin` for a binary and then executes it is reading outside the vault, even if it
writes nothing. Say so in the README.

### Also required

- A `LICENSE` file, and compliance with the licences of any code used, with attribution in the
  README if required.
- Respect Obsidian's trademark; do not imply a first-party plugin.
- **Forks are not allowed** unless the original author gave publicly verifiable written approval,
  or is demonstrably unreachable and has not updated the project for 6 months (then 30 days'
  notice). The original author must be credited either way.

---

## Plugin-specific submission requirements

Source: `en/Community directory/Submission requirements for plugins.md`.

- `fundingUrl` only for real financial-support links; remove it if donations are not accepted.
- `minAppVersion` = the minimum Obsidian version the plugin actually works on.
- Description: ≤ 250 characters, ends with `.`, **no emoji or special characters**, correct
  capitalisation of proper nouns, does not start with "This is a plugin".
- Node.js/Electron APIs ⇒ `isDesktopOnly: true`, no exceptions.
- Command IDs must not repeat the plugin ID — Obsidian prefixes it automatically.
- All sample-plugin boilerplate removed.

---

## Checking precedent before assuming a rule is enforced

Policy text and enforcement are not the same thing. When a plugin does something the policies
appear to forbid, check what the directory has actually published before advising the user to
rewrite it.

```bash
# The authoritative list of everything currently approved (~7,800 entries).
curl -sL -o community-plugins.json \
  https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json

# Was a given plugin ever listed? Snapshot the registry at a past date.
sha=$(gh api "repos/obsidianmd/obsidian-releases/commits?path=community-plugins.json&until=2025-12-01T00:00:00Z&per_page=1" --jq '.[0].sha')
curl -sL "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/$sha/community-plugins.json" \
  | python -c "import json,sys; print(any(p['repo']=='owner/repo' for p in json.load(sys.stdin)))"
```

Bisecting that by date shows *when* a plugin was delisted, which usually distinguishes
enforcement from the author archiving it.

**Read the file with `encoding='utf8'` explicitly** — plugin descriptions contain em dashes and
CJK, and Python on a CJK Windows locale defaults to cp950 and throws.

### What the findings were, September 2026

| Behaviour | Precedent |
| --- | --- |
| Local HTTP server exposing the vault | **Settled.** `obsidian-local-rest-api`, `note-api`, `live-preview`, `html-server` — and `html-server` binds beyond loopback and its README recommends ngrok for public access |
| Running an external binary | **Settled, but always user-installed.** `obsidian-pandoc` and `enhancing-export` (pandoc), `ffmpeg-converter` (ffmpeg), Obsidian Git (system git), `openterm` (system shell) |
| **Downloading an executable at runtime** | **One precedent.** `jacksteamdev/obsidian-mcp-tools` shipped SLSA-attested signed binaries and was listed from at least 2025-06 to 2026-05. Delisted between 2026-05-01 and 2026-05-20, matching the author archiving it on 2026-05-13 — so withdrawal, not enforcement. **No currently listed plugin does this.** |
| Publishing notes publicly | **Common**, but every example uploads to a hosted service. Nothing in the directory tunnels from the user's own machine |

**The practical conclusion:** requiring a user-installed binary is what every living comparable
plugin does, and it removes the policy exposure entirely. Recommend it. If the download stays,
tell the user it is a real gamble and have the mitigations documented for the review thread.

---

## What the automated scan actually reports

Verified against a real submission in September 2026. The report is grouped into sections, and
only **Source code** produces errors that block listing — everything else is Warning or
Recommendation, which feed the safety scorecard.

Run [`scripts/check-api-versions.mjs`](../scripts/check-api-versions.mjs) before submitting; it
reproduces the one finding that is an error.

### Source code — the only section that blocks

**`obsidianmd/no-unsupported-api`** — an API newer than the declared `minAppVersion`. This is an
**Error**. `obsidian.d.ts` carries `@since` annotations, so it is entirely checkable in advance,
and a real submission was rejected over `workspace.getLeafById` (`@since 1.5.1`) against a
declared `1.5.0` — one patch release.

> Matching `@since` by bare method name over-reports wildly. `get`, `filter`, `includes`, `map`,
> `render`, `display` and friends all exist on Obsidian types *and* on things every codebase
> uses; an early version of the checker confidently demanded 1.13.1 purely from `Array.filter`
> and `Map.get`. And the same name often has several declarations with different `@since` —
> `Menu.addItem` is ancient while something else called `addItem` is recent — so a name is only
> provably unsupported when **every** declaration carrying it is too new.

**The `@typescript-eslint/no-unsafe-*` flood is usually a tsconfig problem, not a code problem.**
One submission drew ~150 of them across every file touching a Node API, plus
`'error' type that acts as 'any'` on `Server` and `ChildProcess`. Running the same rules locally
reproduced **one**.

The cause: `skipLibCheck` was passed on the `tsc` command line but absent from `tsconfig.json`,
and a type-aware lint reads the tsconfig. Without it `obsidian.d.ts` fails its own typecheck
(`Menu`, `Modal` and `PopoverSuggest` each reported as incorrectly implementing `HistoryHandler`)
and those upstream errors degrade type resolution until every Node-derived value arrives as `any`.

Before rewriting any code in response to these, reproduce them locally with
`parserOptions.project` pointed at the real tsconfig. If they do not reproduce, fix the project
configuration instead: `skipLibCheck` in `tsconfig.json` where every tool sees it, an explicit
`"types": ["node"]`, and `lib`/`target` new enough for the installed `@types/node`.

Then fold the type-aware ruleset into `npm run lint` so the project and the directory check the
same thing. Doing that on one plugin immediately surfaced two real defects the untyped lint could
not see: `loadData()` returning `any` and being spread into the settings object — silently
disabling type checking everywhere settings were read — and a template literal printing
`code null`.

### Behaviour — capability warnings, not defects

`fs` use, `child_process` use and clipboard access are each flagged. They describe what the
plugin *can* reach, and cannot be removed without removing the feature. Narrow them instead, and
disclose them in the README:

- Import by name (`import { statSync } from "fs"`) rather than `* as fs`, so the reachable
  surface is legible at the top of the file.
- Prefer the `execFile` family over `exec`: nothing goes through a shell.
- Say plainly in the README what is read, what is written, and what never is.

### CSS lint

Browser features Obsidian only partially supports are flagged with file:line. `display: contents`
is the common one, usually on a wrapper that exists only to let children join a parent grid —
deleting the wrapper and making them direct grid children removes the feature and shortens the
markup. It is worth doing on its own merits: `display: contents` has a history of dropping
elements from the accessibility tree.

### Build verification

A **committed lockfile** is required for the build to be reproducible byte-for-byte.
`package-lock.json` is gitignored by several popular plugin templates — check. Commit it, and
switch CI to `npm ci`, because a lockfile the build ignores is decoration.

### Releases — artifact attestations

Recommended for the release assets, and named as a future component of the safety scorecard. In
the release workflow:

```yaml
permissions:
  contents: write
  id-token: write        # both are required to issue an attestation
  attestations: write

# after the build, before creating the release
- uses: actions/attest-build-provenance@v2
  with:
    subject-path: |
      main.js
      styles.css
```

Anyone can then run `gh attestation verify main.js --repo OWNER/REPO`.

### Network requests

Reports suspicious patterns. A plugin that makes no HTTP requests of its own passes trivially.

## Release mechanics that bite

### npm tags with a `v` prefix by default

Obsidian requires the tag to equal the manifest version exactly — `1.0.0`, **not** `v1.0.0`.
`npm version` produces `v1.0.0` unless the repo has an `.npmrc`:

```
tag-version-prefix=""
```

Check with `npm config get tag-version-prefix`. Without this the release is rejected, or a tag
check in CI fails the build. Add the `.npmrc`; do not tell the user to rename tags by hand.

The first release also needs `npm version <v> --allow-same-version` when `package.json` already
carries that version, because npm refuses to set a version to itself.

### Force-pushing does not remove a secret from GitHub

If a credential was ever committed, scrubbing history locally and force-pushing is **not enough**.
GitHub keeps unreferenced objects and will still serve them by SHA:

```bash
gh api repos/OWNER/REPO/git/blobs/<blob-sha> --jq '.sha'   # still resolves after a force-push
```

Options, in order of certainty: create a fresh repository and push the clean history there;
ask GitHub Support to garbage-collect; or accept it (a 40-character SHA has to be guessed). Always
tell the user the credential should be treated as spent regardless.

Scrub with `git filter-repo` (`pip install git-filter-repo`), and **scan the whole history first**
— the same blob is often committed at more than one path:

```bash
git rev-list --objects --all | while IFS= read -r line; do
  sha="${line%% *}"; p="${line#* }"; [ "$sha" = "$p" ] && continue
  [ "$(git cat-file -t "$sha" 2>/dev/null)" = "blob" ] || continue
  git cat-file blob "$sha" 2>/dev/null | grep -qa "BEGIN RSA PRIVATE KEY\|<known-secret>" && echo "  $p"
done | sort -u
```

Paths with spaces break naive `awk '{print $2}'` parsing — use the `${line#* }` form above.

If the repository has uncommitted work, **do the rewrite in a separate clone** and force-push
from there, then bring the working repo across with `git fetch && git reset --mixed origin/main`.
That moves HEAD and the index while leaving the working tree untouched, so uncommitted changes
survive and files that were tracked but are no longer in the new HEAD simply become untracked.

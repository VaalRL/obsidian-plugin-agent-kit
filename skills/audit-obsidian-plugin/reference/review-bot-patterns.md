# ObsidianReviewBot phrasing

When reporting findings, quote the reviewer's exact phrasing so the user can map audit output to
what they will be told.

> [!note] These lines date from the pull-request era.
> Submissions no longer go through a PR on `obsidianmd/obsidian-releases`, and `ObsidianReviewBot`
> no longer comments on one — review now runs as an automated scan whose result appears as a
> scorecard on the plugin's directory page. See [submission-process.md](./submission-process.md).
> The wording below is still an accurate guide to *what gets flagged*, which is why it is kept;
> treat it as the substance of the feedback rather than a literal quote you will receive.

Observed in live PRs as of April 2026.

## Manifest / ID / name

- "Plugin IDs should not contain `obsidian`."
- "Plugin IDs should not end with `plugin`."
- "Plugin names should not contain `Obsidian`."
- "Plugin names should not end with `Plugin`."
- "Plugin descriptions should not contain `Obsidian`."
- "Plugin descriptions should not start with `This plugin` ..."
- "Plugin descriptions should end with a period, question mark, exclamation mark, or closing parenthesis."
- "Could not find a release for tag `X` matching the `version` field in your `manifest.json`."
- "The `version` in `manifest.json` does not match the release tag. Tags should not include a leading `v`."

## DOM / security

- "Do not write to DOM directly using `innerHTML`/`outerHTML` property."
- "Using `innerHTML`, `outerHTML` or similar APIs is a security risk. Instead, use the DOM API or the Obsidian helper functions."

## Console

- "Unexpected console statement. Only these console methods are allowed: `warn`, `error`, `debug`."

## UI text

- "Use sentence case for UI text."
- "For a consistent UI use `new Setting(containerEl).setName(...).setHeading()` instead of creating HTML heading elements directly."
- "Avoid using `settings` or the plugin name in heading text."

## Commands

- "Command names should not contain the word `command`."
- "Command names should not contain the plugin name."
- "Avoid setting default hotkeys as they may conflict with user preferences."

## Platform detection

- "Avoid using the `navigator` API to detect the operating system. Use the `Platform` API instead."
- "Avoid using `process.platform`. Use the `Platform` API instead."

## Types / language

- "Unexpected any. Specify a different type."
- "`var` has function-level scope, so it can easily lead to bugs if you're not careful."
- "Use `const` or `let` instead."
- "Use ES6 `import` instead of `require()`."

## Promises

- "Promises must be awaited, end with a call to `.catch`, end with a call to `.then` with a rejection handler or be explicitly marked as ignored with the `void` operator."
- "`async` function has no `await` expression."

## Casting / type guards

- "Use `instanceof TFile` check instead of casting."

## Styles

- "You should avoid assigning styles via JavaScript or in HTML and instead move all these styles into CSS so that they are more easily adaptable by themes and snippets."

## HTTP

- "Prefer `requestUrl` from Obsidian over `fetch` to avoid CORS issues and to be consistent with Obsidian's built-in API."

## Paths

- "Use `Vault.configDir` instead of hardcoding `.obsidian`."
- "Use `normalizePath()` for user-provided paths."

## Lifecycle

- "Do not call `detachLeavesOfType` in `onunload`. Obsidian handles leaf cleanup automatically; detaching here causes user state loss and memory leaks on reload."
- "Avoid storing view references on the plugin instance."

## Skip mechanism

When a finding is a proper noun or branded feature name, the user may comment on the PR:
```
/skip Items [1]-[N] are proper nouns / branded feature names / command labels, so sentence case is not appropriate.
```

Do not auto-add `/skip` to PRs. Surface the candidate items so the user can decide.

## Re-validation

"Do NOT open a new PR for re-validation. Push changes to the existing branch to trigger the bot to re-scan."

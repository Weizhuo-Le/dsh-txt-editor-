# dsh-txt-editor

English | [中文](README.zh.md)

**Edit `.txt` in place inside the DSH right sidebar** — the document tab you already open becomes a text area, with **line numbers per paragraph** for proofreading. Type, press `Ctrl+S`, the file on disk is updated.

Step-by-step manual (Chinese): [USAGE.md](USAGE.md).

## Install

```sh
dsh plugin --profile web add github:REPLACE_WITH_YOUR_USERNAME/dsh-txt-editor
```

The desktop app can do the same from **Settings → Plugins** (add from GitHub). Refresh the page afterwards (`Ctrl+R` / `⌘R`).

> No npm release; the plugin has no build step, so the GitHub source is the complete package.

## What it does

- Opens `.txt` / `.text` in the document tab as an **editor** instead of a read-only preview.
- **Line numbers in the left gutter**: one number per logical line (`\n`). A paragraph that wraps across several rows keeps a single number on its first row; blank lines keep their own number. Edits that change wrapping move the numbers with the text.
- Character and line count, dirty indicator, last-saved time.
- `Ctrl+S` / `⌘S` saves; the Save button is disabled when nothing changed.
- **Reload** re-reads from disk, asking first when there are unsaved edits.
- Honours the document toolbar's wrap toggle.
- The toolbar's viewer dropdown lists it as **Editable text**, so the shipped read-only rendering stays one click away.
- One scrollbar, not two.

Markdown, HTML, images, PDF, Excel and Office keep their normal previews.

## How the line numbers work

No measurement, no offsets: a hidden "ghost" layer holds a copy of the text in the field's **own computed typography and padding**, and every visible number is placed inside that copy's row. The browser stacks those rows exactly as it stacks the field's lines, so a number cannot drift onto another row — and when an edit makes a line wrap, the number moves with it.

Two details matter:

1. The field reserves the **scrollbar width**, so the ghost adds it to its right padding. Without that the copy is ~15px wider, a line that wraps in the field stays on one row in the ghost, and every number below rides a row high.
2. The numbers are anchored to the gutter's right edge (`margin-right`) rather than the text's, so they never sit on the divider line.

Scrolling moves the ghost with the textarea by a single `transform` (no re-render, no re-layout).

## How it works

The right column renders document tabs through DSH's `documentPreviews` registry, which picks an implementation by priority band and file suffix. This plugin registers an `extension`-band implementation for `txt` / `text`; nothing is patched and no shipped implementation id is replaced.

`dsh.client.inject` orders this module after `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`. That matters beyond tidiness: a slot entry registered before that package declares its slot runs inside *its* `register()` call, where a throw is reported as that package's activation failure — and one failed entry aborts the whole web boot. Every registration here is guarded, so the worst case is an absent editor, never a host that cannot start.

Text and saves go through the plugin's own Host routes:

| Route | Purpose |
| --- | --- |
| `GET /novel-txt/list` | `.txt` / `.md` files of a registered workspace |
| `GET /novel-txt/read?absolute=1&path=…` | text plus its version, EOL and BOM flag |
| `POST /novel-txt/save` | write-back |

## Safety

- **Workspace-scoped.** Every path is resolved and checked with `fs.contains` against the workspaces DSH already registered; anything outside returns `403`, and writes pass `{ mode: 'workspace-write', workspaceRoot }`.
- **No silent overwrite.** Reads return a file version and saves use `replaceIfVersion`; if the file changed meanwhile the save returns `409` and the panel asks you to reload.
- **Format preserving.** CRLF/LF and a leading BOM are detected on read and restored on write.
- **No cross-site writes.** Requests must carry the `x-novel-txt` header and a same-origin `Origin`.

## Compatibility

Requires DSH Web or desktop **0.2.1 or newer** (the line that ships the right-sidebar document preview package). Declared as `engines.dsh`.

No `@deepseek-ai/*` imports: the client half talks only to documented services (`ctx.slots`, `ctx.locale`, `ctx.get('documentPreviews')`), the Host half only to `ctx.fs` and `ctx.webServer`. No dependencies, no install scripts, no native modules; identical on Windows, macOS and Linux.

## Limitations

- Only `.txt` (and `.text`); `.md` keeps the Markdown preview.
- Only files inside a registered workspace are editable; UTF-8 only.
- No auto-save, no undo history beyond the browser's own.
- The route namespace `/novel-txt/*` is global — do not install two copies under different names.

## Changelog

Full notes: [CHANGELOG.md](CHANGELOG.md).

- **2.4.4** — removed the dead measurement code from the previous line-number design (~15 KB of unreachable paths), so the gutter has a single implementation.
- **2.4.3** — numbers can no longer break across two lines (fixed width + `white-space: pre`).
- **2.4.2** — numbers anchored 7px left of the gutter divider instead of overlapping it.
- **2.4.1** — the ghost layer accounts for the field's scrollbar width, so a wrapped line wraps in the ghost too.
- **2.4.0** — line numbers rewritten as a flow layer (browser lays them out with the text; no measurement).
- **2.1.1 / 2.2.x / 2.3.x** — activation hardening, alignment attempts on the old measurement design, typing-cost reduction.
- **2.0.1** — activation-order fix: the module waits for the document-preview package and never registers into a slot that is still being committed; every registration is exception-guarded.
- **2.0.0** — editable `.txt` in the right sidebar, version-guarded saves, CRLF/BOM preservation.

## License

MIT

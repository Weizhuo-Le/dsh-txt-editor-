# dsh-txt-editor

English | [中文](README.zh.md)

**Edit `.txt` files in place, inside the DSH right sidebar** — the document tab you already open becomes a textbox. Type, press `Ctrl+S`, and the file on disk is updated. No separate file browser, no leaving DSH.

Step-by-step manual (Chinese): **[USAGE.md](USAGE.md)** — interface, save semantics, the “file changed on disk” prompt, encoding and troubleshooting.

## Install

```sh
# from GitHub (source, no build step needed)
dsh plugin --profile web add github:REPLACE_WITH_YOUR_USERNAME/dsh-txt-editor
```

The desktop app can do the same from **Settings → Plugins** (add from GitHub). Refresh the page afterwards (`Ctrl+R` / `⌘R`).

> npm publication is optional and not done yet; the plugin has no build step, so the GitHub source is the complete package.

## Usage

Open any `.txt` file the way you already do — a deliverable card, the right sidebar's file tree, or a file link in the conversation. Instead of the read-only preview you get an editor:

- character and line count, dirty indicator, last-saved time
- **line-number gutter** on the left: one number per logical line (`\n`), so a wrapped paragraph keeps a single number at its first row; it follows scrolling and never re-lays out the text
- `Ctrl+S` (or `⌘S`) saves; the Save button is disabled when nothing changed
- **Reload** re-reads from disk, and asks first when there are unsaved edits
- honours the document toolbar's wrap toggle
- the toolbar's viewer dropdown lists it as **Editable text**, so the shipped read-only rendering is always one click away
- one scrollbar only: the body reports the textarea through the owner's `scrollportRef`, so the pane does not wrap it in a second scroller

Files that are not `.txt` / `.text` keep their normal preview — Markdown, HTML, images, PDF, Excel and Office are untouched.

## How it works

The right column renders document tabs through DSH's `documentPreviews` registry, which selects an implementation by priority band and file suffix. The shipped plain-text implementation is `builtin` and matches no suffix in particular — it is the fallback for anything else.

This plugin registers an `extension`-band implementation for `txt` / `text`, so those files are served by its own document body. Nothing is patched, and no shipped implementation id is replaced.

`dsh.client.inject` orders this module after
`@deepseek-ai/dsh-client-ui-sidebar-documentpreview`, which matters for more than tidiness: a slot entry registered before that package declares the slot runs inside *its* `register()` call, where a throw is reported as that package's activation failure — and one failed entry aborts the whole web boot. Every registration here is guarded, so the worst case is an absent editor, never a host that cannot start.

The body only needs the document's absolute path, which it reads from the tab's resource metadata; text and saves go through the plugin's own Host routes:

| Route | Purpose |
| --- | --- |
| `GET /novel-txt/list` | `.txt` / `.md` files of a registered workspace |
| `GET /novel-txt/read?absolute=1&path=…` | text plus its version, EOL and BOM flag |
| `POST /novel-txt/save` | write-back |

## Safety

- **Workspace-scoped.** Every path is resolved and checked with `fs.contains` against the workspaces DSH already registered; anything outside returns `403`. Writes carry an explicit `{ mode: 'workspace-write', workspaceRoot }` policy.
- **No silent overwrite.** Reads return a file version and saves use `replaceIfVersion`. If the file changed on disk meanwhile — an agent wrote it, another editor saved it — the save returns `409` and the panel asks you to reload instead of clobbering it.
- **Format preserving.** CRLF/LF and a leading BOM are detected on read and restored on write.
- **No cross-site writes.** Requests must carry the `x-novel-txt` header (a custom header cannot be sent cross-origin without a preflight this server never grants) and a same-origin `Origin`.

## Compatibility

Requires a DSH Web or desktop host **0.2.1 or newer** — that line ships the right-sidebar document preview package whose `documentPreviews` registry this plugin extends. Declared as `engines.dsh` in `package.json`.

No `@deepseek-ai/*` packages are imported: the plugin talks to the harness only through its documented client services (`ctx.slots`, `ctx.locale`, `ctx.get('documentPreviews')`) and Host services (`ctx.fs`, `ctx.webServer`). There are no dependencies, no install scripts and no native modules, so it installs and runs identically on Windows, macOS and Linux.

## Limitations

- Only `.txt` (and `.text`) is taken over; `.md` keeps the Markdown preview.
- Only files inside a registered workspace are editable.
- Reads UTF-8 (with or without BOM), UTF-16 and GB18030/GBK; every save is written as UTF-8, and the panel says so when a file is converted.
- A single save is capped at 32 MB.
- No auto-save; the panel shows when there are unsaved edits.
- The route namespace `/novel-txt/*` is global — do not install two copies of this plugin under different names.

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host half: the three routes, workspace checks, version guard |
| `client.js` | Client half: registers the editable `.txt` document implementation |
| `cordis.patch.yml` | Inserts the `novel-txt-editor` row |
| `locale/*.json` | Plugin manager title and description (zh / en) |
| `icon.svg`, `assets/icon-180.png` | Plugin icon, storefront tile |

## Changelog

Full, file-by-file notes: [CHANGELOG.md](CHANGELOG.md).

- **2.2.1** — single scrollbar. The body reports the textarea through the owner's `scrollportRef` so the pane stops wrapping it in a second scroller, and clamps its own height to the space the pane actually offers; measurement scratch nodes moved into a zero-size clipping box.
- **2.2.0** — line-number alignment. The mirror now copies the field's own typography (including `white-space`, `word-break`, `overflow-wrap`, `line-break`, `tab-size`) and is rejected when its total height disagrees with the field; an exact pass measures a same-class textarea clone line by line; the evenly-spaced guess fallback is gone, so an unmeasurable file shows no numbers rather than wrong ones.
- **2.1.1** — activation hardening: the locale binding and dictionary effects moved inside their own guards, and the three Host routes mount through a `try` so a duplicate path cannot fail the host.
- **2.1.0** — line-number gutter, one number per logical line, following scroll imperatively.
- **2.0.1** — activation-order fix. The client module now declares `dsh.client.inject` on the document-preview package and never registers into a slot whose declaration is still being committed; every registration is exception-guarded so a hostile composition degrades to the read-only preview instead of aborting the web boot. No behaviour change otherwise.
- **2.0.0** — editable `.txt` documents in the right sidebar (replaces the 1.x left-panel file browser); extension-band `documentPreviews` implementation, version-guarded saves, CRLF/BOM preservation.

## License

MIT

# dsh-txt-editor

Edit `.txt` files **directly in the DSH right sidebar** — the document tab you already open becomes a textbox. Type, press `Ctrl+S`, and the file on disk is updated. No separate file browser, no leaving DSH.

> DSH（DeepSeek Harness）右侧栏的 `.txt` 就地编辑器：打开 txt 标签即可改，`Ctrl+S` 存回磁盘。支持字数/行数、重新载入、版本号防覆盖，保留 CRLF / BOM。

## Requirements

- DSH desktop app or `dsh web`, **0.2.1 or newer** (needs the right-sidebar document preview package, which ships with `dsh-web-app`).
- Works on Windows, macOS and Linux. No native modules, no build step, no install scripts.

## Install

```sh
dsh plugin --profile web add github:REPLACE_WITH_YOUR_USERNAME/dsh-txt-editor
```

Or install through the desktop app: **Settings → Plugins → add from GitHub**. Then refresh the page (`Ctrl+R` / `⌘R`).

From a local folder (development): point the plugin manager's `install_bundle` at this directory.

## What it does

The right column renders document tabs through DSH's `documentPreviews` registry, which picks an implementation by priority band and file suffix. The shipped plain-text implementation is `builtin` and matches nothing in particular — a bare fallback.

This plugin registers an `extension`-band implementation for `txt` / `text`, so those files get an editable body while `markdown`, `html`, image, PDF, Excel and Office previews are untouched. The document toolbar's viewer dropdown lists it as **Editable text** / **可编辑文本**, so you can always switch back to the read-only rendering.

- character / line count, dirty indicator, last-saved time
- `Ctrl+S` (or `⌘S`) saves; the Save button is disabled when nothing changed
- **Reload** re-reads from disk, and asks first when you have unsaved edits
- honours the document toolbar's wrap toggle

## How saving works

The browser cannot touch the disk, so the package has two halves:

- `index.js` (Host) registers three JSON routes and owns file I/O through DSH's `ctx.fs`:
  - `GET /novel-txt/list` — `.txt` / `.md` files of a registered workspace
  - `GET /novel-txt/read?absolute=1&path=…` — text plus its version, EOL and BOM flag
  - `POST /novel-txt/save` — writes back
- `client.js` (Client) fetches those routes same-origin and renders the editor.

Safeguards:

- **Workspace-scoped** — every path is resolved and checked with `fs.contains` against the workspaces DSH already registered; anything outside is `403`. Writes carry an explicit `{ mode: 'workspace-write', workspaceRoot }` policy.
- **No silent overwrite** — reads return a file version, saves use `replaceIfVersion`. If the file changed on disk meanwhile (an agent wrote it, another editor saved it), the save returns `409` and the panel asks you to reload instead of clobbering it.
- **Format preserving** — CRLF/LF and a leading BOM are detected on read and restored on write.
- **No cross-site writes** — requests must carry the `x-novel-txt` header (a custom header cannot be sent cross-origin without a preflight the server never grants) and a same-origin `Origin`.

## Limitations

- Only `.txt` (and `.text`) is taken over. `.md` keeps the Markdown preview.
- Only files inside a registered workspace are editable.
- No auto-save; the panel tells you when there are unsaved edits.
- Route namespace `/novel-txt/*` is global — do not install two copies of this plugin under different names.

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host half: `/novel-txt/list`, `/read`, `/save`, workspace checks, version guard |
| `client.js` | Client half: registers the editable `.txt` document implementation |
| `cordis.patch.yml` | Inserts the `novel-txt-editor` row |
| `locale/*.json` | Plugin manager title and description (zh / en) |
| `icon.svg` | Plugin icon |

## License

MIT

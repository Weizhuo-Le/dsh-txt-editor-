# 上架 PR 要用的东西

## 1. 先建仓库并上传

GitHub 网页：右上角 **+ → New repository** → 名字 `dsh-txt-editor` → Public → **不要**勾选任何初始化文件（README/License/.gitignore 已在本地准备好）。

建好后，在空仓库页面点 **uploading an existing file**，把这四个东西拖进去：

```
package.json  index.js  client.js  cordis.patch.yml
icon.svg  LICENSE  README.md  .gitignore  locale/en.json  locale/zh.json
```

> 网页上传支持拖整个文件夹，`locale/` 目录会一起带上去。
> 上传前把 `package.json` 里的 `REPLACE_WITH_YOUR_USERNAME`、`LICENSE` 里的
> `REPLACE_WITH_YOUR_NAME` 改成你的用户名和署名。

有 git 的话就是常规流程：

```sh
git init && git add . && git commit -m "dsh-txt-editor 2.0.0"
git remote add origin https://github.com/<你>/dsh-txt-editor.git
git push -u origin main
```

## 2. 往 awesome-dsh-plugin 提 PR

Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>，按该仓库的列表格式加**一条**：

```json
{
  "name": "dsh-txt-editor",
  "owner": "<你的 GitHub 用户名>",
  "url": "https://github.com/<你的 GitHub 用户名>/dsh-txt-editor",
  "category": "ui",
  "description": {
    "en": "Editable plain text in the DSH right sidebar: a .txt file opened in a document tab renders as a textarea with character/line counts, Ctrl+S save, reload, and a version guard that refuses to overwrite a file changed on disk meanwhile. Read and write go through the plugin's own Host routes, limited to registered workspaces, preserving CRLF and BOM.",
    "zh": "在 DSH 右侧栏直接编辑 .txt：文档标签里的纯文本变成可编辑文本框，带字数/行数、Ctrl+S 保存、重新载入，并用版本号防止覆盖磁盘上已被改动的文件；读写走插件自己的 Host 路由，只允许已登记工作区内的路径，保留 CRLF 与 BOM。"
  },
  "npm": null,
  "version": "2.0.0",
  "install": "dsh plugin --profile web add github:<你的 GitHub 用户名>/dsh-txt-editor",
  "added": "2026-11-02",
  "icon": "https://raw.githubusercontent.com/<你的 GitHub 用户名>/dsh-txt-editor/main/icon.svg"
}
```

### PR 标题

```
Add dsh-txt-editor — edit .txt in the right sidebar
```

### PR 正文

```markdown
Adds an editable plain-text implementation for the right sidebar document tab.

**What it does**
- `.txt` / `.text` files opened in the right sidebar render as an editable
  textarea instead of the read-only preview; `Ctrl+S` writes the file back.
- Registers through the public `documentPreviews` extension point
  (`priority: "extension"`, `extensions: ["txt","text"]`), so Markdown, HTML,
  image, PDF and Office previews are untouched. The viewer dropdown still
  offers the shipped read-only rendering.
- Counts characters and lines, tracks the dirty state and the last save time,
  and honours the toolbar's wrap toggle.

**Filesystem scope** (relevant for review)
- Reads and writes go through the plugin's own Host routes; every path is
  resolved and checked with `fs.contains` against workspaces DSH already
  registered — anything outside returns `403`, and writes pass an explicit
  `{ mode: "workspace-write", workspaceRoot }` policy.
- Saves are version-guarded (`replaceIfVersion`): a file changed on disk
  meanwhile returns `409` instead of being overwritten.
- CRLF/LF and a leading BOM are preserved.
- The routes require an `x-novel-txt` header and a same-origin `Origin`, so a
  cross-site page cannot drive them.

**Install**
```sh
dsh plugin --profile web add github:<owner>/dsh-txt-editor
```

Requires dsh >= 0.2.1 (right-sidebar document preview). No build step, no
native modules, no install scripts.

**Routes** `/novel-txt/list|read|save` — global namespace, so this plugin is
not meant to be installed twice under different names.
```

## 3. 覆盖检查

收录后别人的安装命令：

```sh
dsh plugin --profile web add github:<你>/dsh-txt-editor
```

自检：在那台机器上打开任意 `.txt`，右侧文档工具栏的「查看器」下拉里应出现
**可编辑文本 / Editable text**。

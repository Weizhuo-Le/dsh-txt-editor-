# dsh-txt-editor

[English](README.md) | 中文

**在 DSH 右侧栏里就地编辑 `.txt`** —— 你平时打开的那个文档标签，直接从只读预览变成可编辑文本框。改完按 `Ctrl+S`，磁盘上的文件立刻更新，不用另开文件浏览器，也不用离开 DSH。

详细使用说明（界面、保存规则、编码、常见问题）：**[USAGE.md](USAGE.md)**

## 安装

```sh
# 从 GitHub 装（源码安装，没有构建步骤）
dsh plugin --profile web add github:REPLACE_WITH_YOUR_USERNAME/dsh-txt-editor
```

桌面版也可以走 **设置 → 插件 → 从 GitHub 添加**。装完刷新页面（`Ctrl+R` / `⌘R`）。

> 没有发布到 npm，也不影响安装：这个插件没有构建步骤，GitHub 源码就是完整的包。

## 用法

按你平时的方式打开任意 `.txt`（成品文件卡片、右侧栏文件树、对话里的文件链接都行），拿到的不是只读预览，而是编辑器：

- 字数、行数、未保存标记、上次保存时间
- **行号栏**：面板左侧一列，按逻辑行（`\n`）编号——开了自动换行，长段落也只占一个号，号码对齐该段第一行；跟随滚动，不重排正文
- `Ctrl+S`（或 `⌘S`）保存；没有改动时「保存」按钮是灰的
- **重新载入**按磁盘重读，有未保存修改会先确认
- 跟随文档工具栏的「换行」开关
- 文档工具栏的「查看器」下拉里叫 **可编辑文本**，随时能切回自带的只读渲染
- **只有一条滚动条**：正文通过 owner 的 `scrollportRef` 上报自己的滚动容器，外层面板不再叠一层滚动

非 `.txt` / `.text` 的文件完全不受影响：Markdown、HTML、图片、PDF、Excel、Office 仍是原来的预览。

## 工作原理

右侧栏的文档标签正文来自 DSH 的 `documentPreviews` 注册表，按**优先级档 + 文件后缀**挑实现。自带的纯文本实现是 `builtin` 档、不声明后缀，只做兜底。

本插件注册一个 `extension` 档、后缀 `txt` / `text` 的实现，于是这些文件由插件自己的正文组件渲染 —— 不改任何自带实现，也不顶替任何实现 id。

`dsh.client.inject` 把本模块排在 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` 之后激活，这不只是顺序问题：在它声明槽位之前就去注册槽位条目，回调会跑在**它的** `register()` 调用内部，抛错会被记成它的激活失败 —— 而只要有一个 entry 激活失败，整个 web boot 就会中止。这里所有注册都做了异常保护，最坏情况是没有编辑器，绝不会让宿主起不来。

正文只需要文档的绝对路径（从标签的资源元数据里读），文本读写走插件自己的 Host 路由：

| 路由 | 作用 |
| --- | --- |
| `GET /novel-txt/list` | 已登记工作区里的 `.txt` / `.md` |
| `GET /novel-txt/read?absolute=1&path=…` | 正文 + 版本号 + 换行/BOM 标记 |
| `POST /novel-txt/save` | 写回 |

## 安全边界

- **只动工作区内**：每个路径都用 `fs.contains` 对着 DSH 已登记的工作区校验，之外的直接 `403`；写入显式带 `{ mode: 'workspace-write', workspaceRoot }`。
- **不会闷头覆盖**：读文件返回版本号，保存用 `replaceIfVersion`。期间被我（agent）或别的程序改过，保存返回 `409` 并提示先重新载入。
- **不破坏格式**：CRLF / LF 与前导 BOM 读取时识别、写回时还原。
- **拒绝跨站写入**：请求必须带 `x-novel-txt` 头（跨站带自定义头会触发预检，而服务端不返回 CORS 头），并校验同源 `Origin`。

## 兼容性

需要 DSH Web / 桌面版 **0.2.1 及以上** —— 这一线才带右侧栏文档预览包，也就是本插件扩展的 `documentPreviews` 注册表。已在 `package.json` 的 `engines.dsh` 里声明。

不 import 任何 `@deepseek-ai/*` 包：只通过文档化的客户端服务（`ctx.slots`、`ctx.locale`、`ctx.get('documentPreviews')`）和 Host 服务（`ctx.fs`、`ctx.webServer`）工作。没有依赖、没有安装脚本、没有原生模块，Windows / macOS / Linux 表现一致。

## 限制

- 只接管 `.txt`（以及 `.text`）；`.md` 仍是 Markdown 预览。
- 只有已登记工作区里的文件可编辑。
- 没有自动保存；面板会显示未保存状态。
- 路由前缀 `/novel-txt/*` 是全局的 —— 不要用不同包名装两份。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半：三条路由、工作区校验、版本守卫 |
| `client.js` | Client 半：注册可编辑的 `.txt` 文档实现 |
| `cordis.patch.yml` | 插入 `novel-txt-editor` 行 |
| `locale/*.json` | 插件管理器里的标题与说明（中 / 英） |
| `icon.svg`、`assets/icon-180.png` | 插件图标、市场卡片图 |

## 更新记录

逐版本、逐文件的说明见 [CHANGELOG.md](CHANGELOG.md)。

- **2.2.1** —— 修**双滚动条**：正文上报 `scrollportRef`，外层面板不再叠一层滚动；面板高度夹到外框可用高度；测量用的临时节点移进 0 尺寸裁切容器。
- **2.2.0** —— 修**行号对齐**：镜像层复制输入框自己的排版属性并做总高度校验；新增同款式 textarea 克隆的精确测量；删掉「按行高等距」兜底（量不准就留空，不再显示错号）。
- **2.1.1** —— 激活加固：locale 绑定与词典 effect 各自加保护；宿主三条路由走 `mount()` 包裹，路由重复不影响启动。
- **2.1.0** —— 行号栏：一个逻辑行一个号，跟随滚动。
- **2.0.1** —— 修激活顺序：客户端模块声明 `dsh.client.inject` 依赖文档预览包，不再往「声明尚未提交完」的槽位里注册；所有注册都加了异常保护，最坏退化成只读预览，不会再把 web boot 拖挂。功能无变化。
- **2.0.0** —— 右侧栏就地编辑 `.txt`（取代 1.x 的左侧面板文件浏览器）；`extension` 档 `documentPreviews` 实现、版本号防覆盖、CRLF/BOM 保留。

## License

MIT

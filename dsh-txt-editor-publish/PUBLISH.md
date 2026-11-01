# 把「右侧文本编辑」发到 dshmarket 的步骤

先说清楚一件事：**dshmarket 不接受直接上传 zip**。它的插件目录来自社区仓库
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
上架 = 往那个仓库提一个 PR（一条目录项），站点和 dshmarket 会自动抓取，通常一天内生效。
所以顺序是：**先有公开源码 → 再提目录项**。

---

## 第 0 步：装 dshmarket（只是想用市场的话）

- 桌面版：设置 → 插件 → 搜 `dshmarket` 安装；
- `dsh web`：

  ```sh
  dsh plugin --profile web add dshmarket
  ```

装完在「插件」页多一个 **Plugin Market** 标签。参考：
<https://github.com/dsh-market/dsh-market>

---

## 第 1 步：把插件放到公开仓库

当前包名是 `@local/dsh-novel-txt-editor`，`@local` 是本地约定，发布前建议改：

| 改什么 | 从 | 到 |
| --- | --- | --- |
| `package.json` 的 `name` | `@local/dsh-novel-txt-editor` | `dsh-txt-editor`（或你自己的 npm scope） |
| `package.json` 的 `version` | `2.0.0` | 保持 `2.0.0` |
| 新增 `license` | — | `MIT` |
| 新增 `repository` | — | `{ "type": "git", "url": "https://github.com/<你>/dsh-txt-editor" }` |
| 新增 `keywords` | — | `["dsh","dsh-plugin","editor","txt","right-sidebar"]` |

`cordis.patch.yml` 里的行 id `novel-txt-editor` 和客户端注册的 key 都不用改；
只有包的 `name` 需要改，因为公开源要有一个不跟别人冲突的名字。

然后：

```sh
git init
git add .
git commit -m "dsh-txt-editor 2.0.0"
git remote add origin https://github.com/<你>/dsh-txt-editor.git
git push -u origin main
```

> 这个插件没有构建步骤、没有 `scripts`、没有原生模块，
> 所以市场用 `github:<owner>/<repo>` 直接装就能跑，不需要 npm 发布。
> 想发 npm 也行：`npm publish --access public`。

---

## 第 2 步：往 awesome-dsh-plugin 提 PR

1. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>；
2. 在它的列表里加**一条**目录项（格式见该仓库的说明），内容用本目录的
   `catalog-entry.json`，把 `<你的 GitHub 用户名>` 和日期填上；
3. 提 PR，标题类似 `Add dsh-txt-editor`。

参考同类已收录插件（同样是右侧栏文档渲染，可以直接对照它的写法）：
<https://awesome-dsh-plugin.com/p/2002XiaoYu/dsh-session-diff/>

---

## 第 3 步：等收录 & 自检

- 通常 1 天内出现在 <https://awesome-dsh-plugin.com> 和 dshmarket 的 Discover 里；
- 收录后别人的安装命令是：

  ```sh
  dsh plugin --profile web add github:<你>/dsh-txt-editor
  ```

- 上线前自己验一遍：装到一台干净机器/新 profile，打开任意 `.txt`，
  看文档工具栏的「查看器」下拉里有没有 **可编辑文本**。

---

## 已知的审核风险点（提前规避）

1. **能力声明**：目录会自动扫描插件能力（`fs-read`/`fs-write`/`network`…）。
   本插件写入只限已登记工作区，且带版本号防覆盖 —— 这点建议在 PR 描述里写明，
   审核方对「能写文件的插件」通常要求说明边界。
2. **路由是全局的**：`/novel-txt/*`。如果别人同时装了另一个同名路由的插件会冲突，
   PR 里最好注明路由前缀。
3. **依赖版本**：插件依赖 `dsh-web-app` 里自带的
   `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`。建议在 README 写明
   「适配 dsh 0.2.1 及以上的 Web/桌面版」，并声明 `engines.dsh`，
   否则市场无法判断兼容性（会显示为 unknown）。
4. **截图**：目录项支持 `screenshots`，欢迎空着先上；有截图通过率更高。
   截右侧栏编辑 `.txt` 的那一屏 + 「查看器」下拉里出现「可编辑文本」的那一屏。

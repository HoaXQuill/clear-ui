# clear-ui

DSH 插件。在输入框上方加一个「清爽」开关：一键把会话正文里的日志行（工具调用、思考过程、按步展开的执行记录）收成精简形态，再点一下恢复原样。

它不重写渲染，只读写 DSH 自带的设置项 `ui-chat.transcriptView`（设置 → 通用 → 工作详情，四档：精简 / 标准 / 详细 / 冗长）。唯一注入的样式只作用于 dock 槽位本身，用来把那一排控件改成横排（见下）。

## 效果

- **清爽 · 开** → `transcriptView = "compact"`：进行中的回合不再逐条展开工具行，历史回合按分组折叠，只留结果。
- **清爽 · 关** → 回到你切换前的那一档（默认「标准」）；回退档记在 `localStorage["clear-ui:prev-transcript-view"]`。
- 按钮跟随 Host 设置实时更新：你在设置页改档，按钮状态同步。
- 设置尚未加载完或当前不可写时，按钮置灰并给出原因，不会假装切换成功。

## 安装

```
dsh plugin add file:C:/Users/HoaXQ/Desktop/插件/clear-ui --profile desktop
```

安装后**重启 DSH**（客户端插件在启动时扫描并加载，改 `lib/client.js` 后同样要重启）。

## 位置与形态

- 槽位：`conversation.input.dock`（list / session 作用域），注册 id `clear-ui`，order `41`。
- 和别的按钮并列：dock 容器是纵向 flex（`.*_composerStack`，行距 6px），默认每个条目各占一行。插件在 `apply()` 里往 `<head>` 注入一条样式，把槽位锚点 `div[data-slot="conversation.input.dock"]` 从行内的 `display:contents` 改成一行自适应横排：

  ```css
  div[data-slot="conversation.input.dock"]{display:flex!important;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;width:100%;min-width:0}
  ```

  行内样式不带 `!important`，所以作者样式里的 `!important` 能盖掉 `display:contents`。这样这个槽位里所有条目（本插件的「清爽」、dsh-thinking-review 的「追问澄清 / 复盘本会话」……）自动排成一行、宽度按内容自适应、放不下才换行——不用量高度，也不用负 margin。样式带 id `clear-ui-dock-row`，重复注入是幂等的。

  曾经试过的做法（负 `marginTop` 把本行抬进上一行）已废弃：dock 每条都是整窗宽的 flex item，自己右对齐会把别的按钮留在整窗最左边，视觉上像被删掉了。
- Host 半边是空壳（`lib/index.js`），只为让浏览器半边 `lib/client.js` 被加载。
- 浏览器半边通过 `ctx.configForms.get("ui-chat")` 订阅并写入，不直接碰 `remote.settings`。

## 开发

```
node test/smoke.mjs        # Host 半边
node test/client-smoke.cjs # 浏览器半边（node:vm 里跑 ModuleLoader 工厂，不开浏览器）
node scripts/sync.mjs      # 改完代码同步进 profile（硬链接会被编辑器保存切断）
```

`dsh plugin add file:...` 会在 profile 的 `node_modules/clear-ui` 放源文件的硬链接拷贝；编辑器保存一般先写临时文件再改名，inode 一换硬链接就断，profile 里留下的还是旧内容。所以改完 `lib/*.js` 要么重跑一次 `dsh plugin add`，要么跑 `npm run sync`，然后重启 DSH（或刷新窗口）。

## 边界

- 只切档，不改 DSH 的行渲染逻辑：真正的折叠行为由 `@deepseek-ai/dsh-client-ui-chat` 的 `POLICIES` 决定。
- 横排样式作用于 `conversation.input.dock` 整个槽位：槽位里若还有别的面板型条目（待办 / 队列），它们也会进这一行并按内容宽度收缩；放不下时换行。
- 如果将来 DSH 改掉 `ui-chat` / `transcriptView` 这个字段名，按钮会进入「设置不可写」或「仍在读取」状态而不是静默失败——那时候要改的是 `lib/client.js` 里的 `NS` / `FIELD`。
- 若 Host 侧禁用设置持久化（非 loopback 页面），`writable` 为 false，按钮禁用；这是设计行为，不是 bug。

# Quick Paste

**常用话术、提示词、邮件签名，按一下快捷键，轮盘选中即输入。**

Quick Paste 是一款开源的 Windows 10/11 x64 常用文本工具，使用本地文本库，不读取或修改系统剪贴板，不需要账号。

[English](README.en.md) · [更新记录](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md) · [MIT 许可证](LICENSE)

[![Windows CI](https://github.com/suiyuelichou/quick-paste/actions/workflows/ci.yml/badge.svg)](https://github.com/suiyuelichou/quick-paste/actions/workflows/ci.yml) · [下载版本](https://github.com/suiyuelichou/quick-paste/releases) · [反馈问题](https://github.com/suiyuelichou/quick-paste/issues)

![Quick Paste 文本库](docs/images/library.png)

<details>
<summary>查看轮盘与导入预览</summary>

![常用文本轮盘](docs/images/wheel.png)
![导入预览与重复项处理](docs/images/import-preview.png)

</details>

## 安装与下载

公开发布后，在 [Releases 页面](https://github.com/suiyuelichou/quick-paste/releases) 下载 `Quick-Paste-1.1.1-x64.exe`。如果当前还没有公开 Release，可以按照下方开发步骤自行打包。

安装后从开始菜单启动 Quick Paste，首次打开会进入“一分钟上手”。关闭管理窗口后仍驻留托盘，从托盘菜单选择“退出”才会结束程序。

## 功能

- **鼠标旁的轮盘：**默认 `Ctrl+Alt+Space` 唤起，每页 8 条，滚轮翻页，方向键选择、Enter 输入、Esc 退出。
- **固定位置：**轮盘按分组和文本的手动顺序排列；使用次数和收藏不会让条目换位。
- **搜索与收藏：**直接键入关键词搜索正文或分组，收藏在搜索结果中优先展示。
- **编辑保护：**草稿本地保留，切换文本前确认，支持 `Ctrl+S`；切换设置或重启后可以继续编辑。
- **模板分享：**JSON 导入预览、重复检测、同名分组合并，全部或单分组导出。
- **自动备份：**修改前备份，保留最近 10 份，支持恢复与撤回恢复。
- **可选示例：**6 条客服、办公和提示词示例，加上真实输入练习框。

## 使用

1. 在“快速上手”中添加示例，或直接进入文本库创建自己的内容。
2. 点击练习框或其他普通应用的输入框，按 `Ctrl+Alt+Space`，点击轮盘中的文本。
3. 在文本库中编辑内容，拖动分组和条目安排轮盘位置。轮盘标签自动取正文第一行前 14 个字符。

关闭管理页后应用仍驻留系统托盘。快捷键和开机启动可在“设置”中修改。为避免影响其他软件的焦点切换，快捷键必须包含修饰键，不会占用单独的 `Tab` 键。

## 导入、导出与恢复

- **导入：**“设置 → 导入 JSON”选择文件，预览分组数量和重复项，再选择跳过重复或保留为新条目。同名分组合并，同组正文完全相同才算重复；不覆盖现有文本和设置。
- **导出：**设置页可导出全部已保存文本；文本库左侧可导出当前分组。导出不包含使用记录、偏好设置和未保存草稿。
- **备份：**修改文本、分组、设置、导入和恢复前自动备份；记录使用次数不会轮换备份。设置页展示每份备份的时间和文本数量。
- **恢复：**恢复文本和分组，保留当前快捷键、开机启动和引导状态。当前库会先备份，可再恢复刚生成的备份撤回操作。
- **损坏恢复：**启动时发现数据损坏，会保留 `.corrupt-*` 原文件并尝试恢复最近有效备份。没有有效备份时提示错误并停止本次启动，不静默覆盖损坏文件。

导入支持本工具导出的模板包和旧版完整数据 JSON，单文件最大 10 MiB；最多 1000 个分组、10000 条文本，单条最多 100000 个字符。当前为纯文本格式，不执行模板中的代码。

可以下载仓库内的 [上手示例模板包](templates/getting-started.json) 试用导入。

数据文件名为 `quick-paste-data.json`，位于 Electron `userData` 目录；备份位于同目录下的 `quick-paste-data.json.backups/`。编辑草稿保存在该应用 Chromium 本地存储中，同样未加密。备份与主文件在同一磁盘，请定期导出到另一处存储。

## 开发

```powershell
npm ci --cache .npm-cache
npm run dev
```

常用命令：

```powershell
npm test
npm run typecheck
npm run build
npm run test:smoke
npm run package
```

需要 Windows 和 Node.js 22.12+，建议使用 Node.js 22 LTS。`npm run native:build` 使用 Windows .NET Framework C# 编译器构建 `native/InputHelper.cs`。安装包输出到 `dist/Quick-Paste-1.1.1-x64.exe`。

`test:smoke` 需在构建后运行，会使用隔离目录验证真实 Electron 窗口、preload、IPC、导入导出和草稿保护，生成截图到 `.smoke/`。不会更改日常使用的数据，也不验证其他应用的原生输入兼容性。

普通提交和 PR 触发 Windows CI；推送与版本号一致的 `v*` 标签触发安装包构建和草稿 Release，维护者检查后再公开。详见 [贡献指南](CONTRIBUTING.md)。

## 数据与限制

- 数据以原子写入的 JSON 文件保存在 Electron `userData` 目录中，不会上传。
- 数据未加密，本工具不应作为密码管理器使用。
- 支持中文、英文、Emoji 等纯文本。换行目前发送为 Enter，制表符发送为 Tab；在聊天软件中可能发送消息，在表单中可能切换字段。多行内容请先在测试会话验证。
- Windows 会阻止普通权限进程向管理员权限窗口输入；游戏、安全输入框、远程桌面或自定义输入控件也可能不兼容。
- 输入助手超时、异常退出或输入中断时，可能已有部分文本进入目标窗口。请先检查再决定是否重试；程序不会自动重发。长文本输入期间切换窗口会在下一批发送前被检测并中止后续输入。
- 本版本不包含剪贴板历史、富文本、图片、动态变量或云同步。
- 保存失败时会保留已提交数据和当前草稿，排除磁盘空间或权限问题后可重试。

## 帮助项目成长

分享你的使用场景、贡献一个模板分组、报告目标应用的兼容性，或改进文档都很有帮助。报告问题时请提供版本、复现步骤和不含个人信息的示例，参见 [兼容性验证清单](docs/COMPATIBILITY.md)。

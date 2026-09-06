# 参与 Quick Paste

欢迎提交 Bug、兼容性结果、模板包、文档改进和代码。请先搜索现有 Issue；较大的功能建议先说明使用场景和预期行为。

## 本地开发

需要 Windows 10/11 x64、Node.js 22.12+（建议 Node.js 22 LTS）和 Windows .NET Framework C# 编译器。项目使用 Electron + React + TypeScript，原生输入助手位于 `native/InputHelper.cs`。

```powershell
npm ci --cache .npm-cache
npm run dev
```

## 提交前验证

```powershell
npm test
npm run build
npm run test:smoke
```

`build` 包含类型检查。`test:smoke` 在隔离的数据目录启动真实 Electron 构建，验证 IPC、导入导出和界面，并把截图保存在 `.smoke`；不会访问日常使用的文本库。原生输入兼容性仍需在目标应用中人工验证，见 [兼容性清单](docs/COMPATIBILITY.md)。

修改数据保存、导入导出或恢复行为时，请补充失败路径和数据完整性测试。不要上传自己的文本库、草稿、备份、账号信息或日志中的敏感内容。

## 模板贡献

在应用中整理一个分组，用“导出当前分组”生成 JSON，再放到 `templates/`。添加简短说明，交代适用场景；示例应由你创作或具备相应使用权限，不包含真实客户信息。

## Pull Request

- 描述用户遇到的问题、修改后的行为和验证结果。
- UI 变更附截图；数据格式变更说明旧版本迁移策略。
- 保持默认不读取或修改剪贴板、不上传用户文本的行为。
- 请不要提交 `node_modules`、`out`、`dist`、`.smoke` 或编译出的原生 EXE。

## 发布

维护者同步更新 `package.json`、`package-lock.json`、应用版本展示和 `CHANGELOG.md` 后，推送与包版本一致的标签，例如 `v1.1.0`。GitHub Actions 会测试、打包并创建 **草稿 Release**，附安装包和 SHA-256 校验文件。维护者检查产物后手动公开发布。普通提交和 PR 仅运行 CI，不发布版本。

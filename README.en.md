# Quick Paste

**Your reusable replies, prompts and signatures, one shortcut away.**

An open-source Windows 10/11 x64 text snippet wheel. Press `Ctrl+Alt+Space`, select a snippet near your mouse, and insert it into the original application without reading or changing the clipboard. No account required; data stays local.

[中文说明](README.md) · [MIT License](LICENSE) · [Contributing](CONTRIBUTING.md)

## Features

- Stable wheel positions based on manually ordered groups and snippets.
- Search by content or group; favorites rank higher in search.
- Persistent local editing draft, discard confirmation, and Ctrl+S.
- JSON import preview with duplicate handling; export an entire library or one group.
- Ten automatic backups, restoration, and backup-before-restore.
- Update checks against published GitHub Releases, with manual download and restart confirmation.
- Optional sample snippets and an onboarding practice field.

## Get started

When a public release is available, download `Quick-Paste-1.2.0-x64.exe` from [Releases](https://github.com/suiyuelichou/quick-paste/releases). Otherwise build locally. Launch the app and follow the onboarding screen, or skip the samples and create your own snippets. Closing the manager keeps the app in the system tray.

## Build

Windows, Node.js 22.12+ and the Windows .NET Framework C# compiler are required.

```powershell
npm ci
npm run dev
```

```powershell
npm test
npm run build
npm run test:smoke
npm run package
```

The installer is generated in `dist/`. Smoke tests use an isolated data directory and exercise real Electron UI/IPC. They do not verify native input into third-party applications.

## Data and limitations

Snippets, backups and editing drafts are local and unencrypted. Do not use this application as a password manager. Exports contain saved snippets and groups, excluding preferences, drafts and usage history. Import merges matching group names; exact content in the same group is considered a duplicate.

Input uses Windows SendInput. Elevated windows, secure fields, games, remote desktop and custom controls may reject input. Newlines are sent as Enter and tabs as Tab; chat apps may send messages and forms may change fields. Test multiline snippets before using them in a real conversation. No clipboard history, rich text, images, dynamic variables or cloud sync are included.

If the input helper times out, exits unexpectedly, or insertion is interrupted, some text may already have been entered. Check the target before retrying; Quick Paste never automatically resends the text. During long insertions, it checks the target and foreground window before each batch and stops subsequent input if focus has changed.

Installed builds check published GitHub Releases for stable updates without uploading local snippets. Downloads and restart installation remain under user control. CI runs on Windows; version tags create an installer, update metadata, and a draft GitHub Release for maintainer review. Drafts are never offered to update clients and are not published automatically.

# Quick Paste Agent Instructions

## Scope and authority

These instructions apply to the entire repository. Treat this file as the canonical AI-agent policy for Quick Paste. Keep changes focused on the user's request, preserve unrelated user changes, and follow existing project conventions.

`README.md` describes the product and normal usage. `CONTRIBUTING.md` contains the human contribution and release workflow. When those documents conflict with this file on engineering constraints, follow this file and report the conflict.

## Project overview

- Quick Paste is a Windows 10/11 x64 desktop application for inserting frequently used plain text.
- The stack is Electron, React, TypeScript, and a small C# native input helper.
- The supported development environment is Windows with Node.js 22.12 or newer and the Windows .NET Framework C# compiler; Node.js 22 LTS is preferred. `scripts/build-native.mjs` locates the compiler and builds the native helper.
- Read the current version from `package.json`. Do not hard-code a release version in new scripts or documentation unless the context requires an example.

## Non-negotiable product guarantees

- Keep user text local by default. Do not add accounts, cloud sync, telemetry, analytics, or uploads without an explicit product decision from the user.
- Do not read from or write to the system clipboard. Text insertion must continue to use the native `SendInput` path.
- Do not log, commit, or include real user snippets, drafts, backups, account details, or other sensitive data in tests, fixtures, screenshots, templates, or diagnostics.
- Do not present Quick Paste as a password manager. Its data is not encrypted.
- Keep snippets as plain text. Imported data is untrusted data and must never be executed as code.
- Preserve user-controlled group and snippet ordering. Usage counts and favorites must not silently reorder the wheel.
- Hotkeys must contain at least one modifier key; do not allow a single ordinary key to be registered globally.
- Preserve draft protection across navigation and restart unless the user explicitly requests a behavior change.
- Preserve editing content when library saves or local draft writes fail, and report the failure accurately. Clear an unsaved draft only after its content is successfully saved or the user explicitly discards it; a completed save must not clear newer edits made while it was pending. Changes to draft storage keys or formats must include a migration strategy for existing drafts.

## Native input behavior

- Preserve validation of the captured target window and foreground confirmation before sending input. If the target is missing or focus cannot be restored, stop and report failure instead of sending text to another window.
- Do not automatically resend the full text after a failed or uncertain input attempt; some characters may already have been inserted. Failure messages must distinguish confirmed failure from an uncertain or partial result and tell the user to check the target before retrying when appropriate.
- Keep input success separate from usage-record persistence. If text was inserted but saving usage metadata fails, report the metadata failure without marking insertion as failed or prompting the user to insert again.

## Architecture boundaries

- `src/main/` owns privileged operations: application lifecycle, windows, tray, global shortcuts, filesystem access, persistence, import/export, native input, and IPC handlers.
- `src/preload/` exposes the smallest practical typed API through `contextBridge`. Never expose raw `ipcRenderer`, arbitrary filesystem access, process execution, or unrestricted channel names.
- `src/renderer/` contains the React UI. Renderer code must not directly import Node.js or Electron privileged APIs.
- `src/shared/` contains shared types and pure domain logic. Prefer pure, independently testable functions here.
- `native/InputHelper.cs` owns Windows native text input. Keep protocol changes synchronized with `src/main/input-helper.ts`.
- Use `QuickPasteApi` in `src/shared/types.ts` as the shared renderer API contract. When adding or changing IPC, keep this contract, related shared types, the main-process handler, preload bridge, and relevant tests synchronized. `src/renderer/src/global.d.ts` references this contract; change it only when the global declaration itself needs to change.

## Electron security

- Keep `contextIsolation: true` and `nodeIntegration: false` for renderer windows.
- Continue denying arbitrary window creation with `setWindowOpenHandler` unless the user explicitly approves a reviewed navigation design.
- Do not load remote application content or weaken `webSecurity`.
- Validate IPC arguments at runtime in the main process, directly or through shared validators, before performing privileged operations. TypeScript types and preload signatures do not replace runtime validation.
- Treat changes to sandboxing, preload exposure, navigation, external links, IPC, or native execution as security-sensitive. Explain the reason and verify the resulting boundary.

## Data integrity

- Serialize persistent mutations so concurrent operations cannot overwrite each other.
- Write data atomically using a temporary file followed by rename/replacement.
- Do not commit new in-memory state until its persistent write succeeds.
- Back up the current library before changes to snippets, groups, settings, imports, or restoration, and retain the established limit of 10 backups unless requirements change. Usage-count and last-used-time updates must not rotate backups. If a required backup fails, abort the mutation without changing the committed library.
- When the main data file is corrupt, preserve it as a `.corrupt-*` file before attempting recovery.
- If the main data file declares a version newer than this application supports, stop loading and prompt the user to upgrade. Do not treat it as corruption, quarantine it, overwrite it, or automatically downgrade it.
- Before restoring a backup, back up the current library so restoration can be undone. Restore snippets and groups while preserving current settings, including the hotkey, startup preference, and onboarding state.
- Validate imported JSON structure, value types, sizes, counts, identifiers, and duplicate behavior. Never overwrite existing content silently.
- Changes to persistence, migration, import/export, backup, or restore behavior require tests for failure paths as well as successful paths.

## Code and repository conventions

- Follow the existing TypeScript style: two-space indentation, single quotes, and no semicolons.
- Prefer small, reviewable changes. Do not combine unrelated refactors with a requested fix.
- Reuse existing types and helpers before introducing parallel abstractions.
- Keep user-facing Chinese copy consistent with the current interface. Consider whether corresponding English documentation also needs updating.
- Do not manually edit generated output or commit `node_modules/`, `out/`, `dist/`, `.smoke/`, or compiled native executables.
- Do not discard, overwrite, or reformat unrelated working-tree changes.

## Required validation

Run checks in proportion to the affected area and report what was actually executed. Combine the requirements of all applicable categories. Reuse a successful check only while the code, dependencies, and relevant environment remain unchanged; retry failed checks after addressing their cause. `npm run build` includes typechecking, and the packaging command includes the build; these satisfy the corresponding checks below. Run smoke tests after the build or packaging command succeeds.

- Pure logic, UI logic, or ordinary TypeScript changes: `npm test` and `npm run typecheck`.
- Main process, preload, build configuration, or integrated UI changes: `npm test` and `npm run build`.
- Persistence, IPC, import/export, backup/restore, onboarding, or real-window behavior: `npm test`, `npm run build`, then `npm run test:smoke`.
- Packaging or installer changes: `npm run package -- --publish never` in addition to relevant tests. Local packaging validation must not publish artifacts.
- Native input changes: run the build and describe any target-application compatibility checks that still require manual verification.
- Documentation-only changes do not require the full test suite unless they modify executable examples, workflows, commands, or release metadata.

Use isolated temporary data directories and fictional fixtures for automated tests and UI verification. Real-window tests must set an isolated Electron `userData` path before loading the application; never use the everyday text library. Follow the existing isolation setup in `scripts/smoke.mjs`.

Smoke tests cover the built Electron UI, preload, and IPC, but stub global shortcut registration and suppress window showing and focus. They do not verify real global hotkeys, focus transfer, or native input into third-party applications. Report any relevant manual checks still needed; use `docs/COMPATIBILITY.md` for target-application input checks.

If a required check cannot run, state the exact reason and do not describe the change as fully verified.

## Documentation and tests

- Update tests whenever observable behavior or a data contract changes.
- UI changes should include a current screenshot when preparing a pull request.
- Update `README.md`, `README.en.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` only where the change affects their audience. Do not add release notes for internal refactoring alone.
- Keep example templates fictional, minimal, and free of personal or customer information.

## Release safety

- Do not create or move tags, publish a release, upload artifacts, or change repository settings without an explicit user request.
- Before a release, synchronize `package.json`, `package-lock.json`, the in-app version display, and `CHANGELOG.md` where applicable.
- A release tag must be `v<package.json version>`.
- Normal pushes and pull requests run Windows CI only. Version tags trigger the packaging workflow, which creates or updates a draft release.
- Treat generated installers as unsigned unless signing has been explicitly configured and verified.
- Never overwrite an already published release automatically. A maintainer must inspect artifacts and explicitly approve public publication.

## Completion expectations

- Lead the handoff with the user-visible outcome.
- Summarize changed files and the validation results.
- Call out remaining risks, manual verification, compatibility limits, or skipped checks.
- Do not claim that work was committed, pushed, released, or externally verified unless that action actually completed.

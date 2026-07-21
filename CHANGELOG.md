# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog, and version entries should match the extension version in `package.json`.

## [Unreleased]

## [0.0.5] - 2026-07-21

### Changed

- Updated the online judge toggle so local `C` and `C++` builds define `ONLINE_JUDGE`, matching judge-style compilation more closely.

### Fixed

- Improved Windows stack-flag initialization so both workspace `C` and `C++` compiler args are seeded correctly for GCC-like compilers.
- Added more reliable workspace-settings initialization paths for compiler stack flags, including a direct `.vscode/settings.json` fallback when VS Code does not materialize the workspace value.

## [0.0.4] - 2026-07-21

### Added

- Added a workspace-level online judge checkbox in the boilerplate panel and settings, similar to the quick toggle workflow in CPH.
- Added a delete-problem confirmation option to remove the active source file along with the testcase folder when needed.

### Fixed

- Increased the default stack for Windows GCC-like `C` and `C++` builds to reduce recursion-depth runtime crashes, while still letting explicit user compiler args override it.

## [0.0.3] - 2026-07-21

### Added

- Added `Create Problem` and `Delete Problem` sidebar workflows.
- Added a boilerplate management panel in the sidebar for `C++`, `C`, `Python`, and `Java`.
- Added Competitive Companion auto-open behavior for the source file and sidebar after import.

### Changed

- Updated source-file switching so the sidebar automatically loads the matching problem testcases.
- Cleared stale testcase content and status when the active problem changes.
- Updated Java boilerplate generation so the public class name matches the generated source filename stem.

### Fixed

- Fixed Competitive Companion imports so the first testcase is focused automatically after import.
- Fixed stale sidebar state when switching between different source files.
- Fixed Java boilerplate class/file name mismatches for generated files.

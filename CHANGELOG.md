# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog, and version entries should match the extension version in `package.json`.

## [Unreleased]

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

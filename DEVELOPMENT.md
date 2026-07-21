# Development

This file is for maintaining and releasing the extension.

## Run Locally

To run the extension in a development host:

1. Open this project in VS Code.
2. Press `F5`.
3. A new Extension Development Host window will open.
4. Test the extension from that development window.

## Package as VSIX

To create a local installable package:

```powershell
vsce package
```

This generates a `.vsix` file in the project root.

## Publishing

To publish to the Visual Studio Code Marketplace, you need:

- a Marketplace publisher
- a valid publisher id in `package.json`
- authentication configured for `vsce`

Official guide:

https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## Release Checklist

Before publishing a new version:

1. Update `package.json` version.
2. Move relevant notes from `CHANGELOG.md` under `Unreleased` into a dated version section.
3. Review `README.md` if user-facing behavior changed.
4. Package the extension with `vsce package`.
5. Publish with your usual `vsce publish` workflow.

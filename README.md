# CP Testcases

CP Testcases is a Visual Studio Code extension for managing and running competitive programming testcases from a dedicated sidebar.

Instead of working with a single `input.txt` and `output.txt`, the extension gives you a testcase dashboard where you can create multiple testcases, run them individually or together, inspect outputs, and keep everything organized inside your workspace.

## Highlights

- Sidebar-first testcase workflow for competitive programming
- Multiple testcase support with per-case pass/fail status
- Run one testcase or run all testcases in sequence
- Support for `C++`, `C`, `Python`, and `Java`
- Automatic source-file detection from the active editor or workspace
- Inline testcase editing for normal-sized files
- Safe handling for very large files with `Open`, `Copy`, and `Import`
- Direct import of large input or expected-output files without pasting into the sidebar
- Dedicated stderr output channel for compile/runtime failures

## Why Use It

Competitive programming workflows are often repetitive:

- copy sample input into a file
- run the program
- compare output
- repeat for every testcase

CP Testcases turns that into a structured workflow. Each testcase is stored separately, can be rerun anytime, and stays attached to the problem workspace.

## Features

### Testcase Dashboard

The extension adds a custom sidebar that shows:

- workspace summary
- testcase list
- pass/fail badges
- run and delete actions
- input, expected output, and last output sections

### Multiple Testcases

Each testcase is stored in its own folder under `.cp-testcases`:

```text
.cp-testcases/
  sample-1/
    meta.json
    input.txt
    expected_output.txt
    output.txt
  sample-2/
    meta.json
    input.txt
    expected_output.txt
    output.txt
```

### Run One or Run All

You can:

- run a single testcase from its card
- run all testcases from the dashboard header
- view pass/fail results directly in the sidebar

### Language Support

The extension supports:

- `C++`
- `C`
- `Python`
- `Java`

By default, it tries to detect the root file using:

1. `cpTestcases.sourceFile` if configured
2. the currently active supported source file
3. a workspace scan with a picker when multiple candidates are found

### Large File Safety

Very large files are intentionally not rendered inline inside the sidebar.

For large testcase files, the extension will:

- avoid loading the file into the webview editor
- show a safe placeholder instead
- let you use `Open`, `Copy`, or `Import`

This helps keep VS Code responsive when testcase files are unusually large.

## Commands

The extension contributes the following core commands:

- `CP Testcases: Add Test Case`
- `CP Testcases: Run All Test Cases`
- `CP Testcases: Run Test Case`
- `CP Testcases: Refresh`
- `CP Testcases: Delete Test Case`
- `CP Testcases: Open File`
- `CP Testcases: Open Help`

## Settings

### General

- `cpTestcases.sourceFile`
- `cpTestcases.testcasesFolder`
- `cpTestcases.ignoreWhitespace`

### C++

- `cpTestcases.cppCompiler`
- `cpTestcases.cppCompilerArgs`

### C

- `cpTestcases.cCompiler`
- `cpTestcases.cCompilerArgs`

### Python

- `cpTestcases.pythonCommand`

### Java

- `cpTestcases.javaCompiler`
- `cpTestcases.javaCompilerArgs`
- `cpTestcases.javaCommand`

## Typical Workflow

1. Open your problem folder in VS Code.
2. Open the `CP Testcases` sidebar.
3. Create one or more testcases.
4. Enter small inputs inline, or use `Import` for large files.
5. Run one testcase or run all.
6. Inspect output and rerun as needed.

## Development

To run the extension locally:

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

## Notes

- Very large files are intentionally file-backed rather than fully inline.
- On older Windows MinGW setups, the extension includes compatibility handling for known `C++17` header issues.
- Compile and runtime errors are written to the `CP Testcases: stderr` output channel.

## License

This project is licensed under the MIT License.
See the `LICENSE` file for details.

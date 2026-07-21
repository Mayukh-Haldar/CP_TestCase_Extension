# CP Testcases

CP Testcases is a Visual Studio Code extension for managing and running competitive programming testcases from a dedicated sidebar.

Instead of juggling a single `input.txt` and `output.txt`, the extension gives you a testcase dashboard where each problem keeps its own samples, results, boilerplate, and source file workflow inside the workspace.

## Highlights

- Sidebar-first testcase workflow for competitive programming
- Multiple testcase support with per-case pass/fail status
- Run one testcase or run all testcases in sequence
- Support for `C++`, `C`, `Python`, and `Java`
- Automatic source-file detection from the active editor or workspace
- Automatic testcase switching when you change the active source file
- Automatic problem-file creation with configurable boilerplate templates
- Built-in boilerplate editor in the sidebar
- Inline testcase editing for normal-sized files
- Safe handling for very large files with `Open`, `Copy`, and `Import`
- Dedicated stderr output channel for compile/runtime failures
- Competitive Companion import support that creates the source file, loads samples, reveals the sidebar, and opens the editor automatically

## Why Use It

Competitive programming workflows are often repetitive:

- copy sample input into a file
- run the program
- compare output
- repeat for every testcase

CP Testcases turns that into a structured workflow. Each problem gets its own testcase folder, each testcase is stored separately, and switching source files switches the sidebar to the matching problem automatically.

## Features

### Testcase Dashboard

The extension adds a custom sidebar that shows:

- active problem name
- workspace name
- testcase list
- pass/fail badges
- run and delete actions
- input, expected output, and last output sections
- boilerplate controls for supported languages

### Problem-Based Storage

Each problem gets its own folder under `.cp-testcases`, and each testcase is stored as a subfolder inside that problem folder:

```text
.cp-testcases/
  super_ships/
    sample-1/
      meta.json
      input.txt
      expected_output.txt
      output.txt
  another_problem/
    sample-1/
      meta.json
      input.txt
      expected_output.txt
      output.txt
```

When a problem is imported from Competitive Companion, the extension creates or replaces:

```text
.cp-testcases/
  imported_problem_name/
    sample_1/
      meta.json
      input.txt
      expected_output.txt
      output.txt
    sample_2/
      meta.json
      input.txt
      expected_output.txt
      output.txt
```

### Automatic Problem Switching

The sidebar follows the currently active source file.

- open `a.cpp` and the sidebar loads `.cp-testcases/a/`
- switch to `b.py` and the sidebar loads `.cp-testcases/b/`
- stale testcase content from the previous problem is cleared automatically

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

1. the currently active supported source file
2. `cpTestcases.sourceFile` if configured
3. a workspace scan with a picker when multiple candidates are found

### Problem Bootstrap

If a workspace does not yet contain a supported source file, you can use `Create Problem` and the extension will:

- ask for the language
- ask for the problem name
- create `<problem-name>.<ext>` in the workspace root
- fill it with boilerplate from your extension settings
- create the matching testcase folder under `.cp-testcases/<problem-name>/`

You can also delete the entire active problem testcase folder from the sidebar with `Delete Problem`.

### Boilerplate Management

The sidebar includes a boilerplate section for `C++`, `C`, `Python`, and `Java`.

You can:

- change the default language
- toggle whether the workspace is set as online judge
- edit each language template inline
- open a template as a file
- keep boilerplate synced with workspace settings

Supported placeholders:

- `{{problemName}}`
- `{{className}}`

For Java, the generated `public class` name now matches the source filename stem so newly created Java files compile without the class-name mismatch error.

### Large File Safety

Very large files are intentionally not rendered inline inside the sidebar.

For large testcase files, the extension will:

- avoid loading the file into the webview editor
- show a safe placeholder instead
- let you use `Open`, `Copy`, or `Import`

This helps keep VS Code responsive when testcase files are unusually large.

### Competitive Companion Integration

If you use the Competitive Companion browser extension, CP Testcases can listen on `localhost` and import sample tests automatically.

How it works:

1. Open the target problem workspace in VS Code.
2. Make sure the CP Testcases extension is active.
3. Visit a supported problem page in your browser.
4. Click the Competitive Companion button.
5. CP Testcases receives the payload, creates the source file if needed, stores the samples under `.cp-testcases/<problem-name>/`, reveals the sidebar, and opens the source file in the editor.

Notes:

- The default local port is `27121`.
- The import replaces any previously imported testcase set for that same problem folder.
- The first imported testcase is focused automatically in the sidebar.

## Commands

The extension contributes the following commands:

- `CP Testcases: Create Problem`
- `CP Testcases: Delete Problem`
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
- `cpTestcases.defaultLanguage`
- `cpTestcases.onlineJudge`
- `cpTestcases.testcasesFolder`
- `cpTestcases.competitiveCompanionEnabled`
- `cpTestcases.competitiveCompanionPort`
- `cpTestcases.ignoreWhitespace`

### C++

- `cpTestcases.cppCompiler`
- `cpTestcases.cppCompilerArgs`
- `cpTestcases.boilerplateCpp`

On Windows, CP Testcases initializes workspace `C++` compiler args with `-Wl,--stack,536870912` for GCC-like native compilers unless your configured args already include a `--stack` linker option. This helps deep-recursion solutions avoid the default small stack.

### C

- `cpTestcases.cCompiler`
- `cpTestcases.cCompilerArgs`
- `cpTestcases.boilerplateC`

### Python

- `cpTestcases.pythonCommand`
- `cpTestcases.boilerplatePython`

### Java

- `cpTestcases.javaCompiler`
- `cpTestcases.javaCompilerArgs`
- `cpTestcases.javaCommand`
- `cpTestcases.boilerplateJava`

## Typical Workflow

1. Open your problem folder in VS Code.
2. Open the `CP Testcases` sidebar.
3. Open or create a source file for the problem.
4. Create testcases manually or import them with Competitive Companion.
5. Enter small inputs inline, or use `Import` for large files.
6. Run one testcase or run all.
7. Switch to another source file whenever you want to move to a different problem.

## Maintainer Notes

Development, VSIX packaging, and publishing instructions are documented in `DEVELOPMENT.md`.

## Notes

- Very large files are intentionally file-backed rather than fully inline.
- On Windows with GCC/MinGW, CP Testcases initializes workspace `C` and `C++` compiler args with a larger stack flag unless you already override it.
- On older Windows MinGW setups, the extension includes compatibility handling for known `C++17` header issues.
- Compile and runtime errors are written to the `CP Testcases: stderr` output channel.

## License

This project is licensed under the MIT License.
See the `LICENSE` file for details.

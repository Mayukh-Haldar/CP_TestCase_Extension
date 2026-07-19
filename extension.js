const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const TESTCASE_META = 'meta.json';
const INPUT_FILE = 'input.txt';
const EXPECTED_FILE = 'expected_output.txt';
const OUTPUT_FILE = 'output.txt';
const MAX_INLINE_FILE_BYTES = 256 * 1024;
let stderrChannel;

function activate(context) {
  stderrChannel = vscode.window.createOutputChannel('CP Testcases: stderr');
  const sidebar = new TestcaseSidebarProvider(context);

  context.subscriptions.push(
    stderrChannel,
    vscode.window.registerWebviewViewProvider('cpTestcases.sidebar', sidebar, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('cpTestcases.refresh', () => sidebar.refresh()),
    vscode.commands.registerCommand('cpTestcases.addTestCase', () => addTestCase(sidebar)),
    vscode.commands.registerCommand('cpTestcases.runAll', () => runAllTestCases(sidebar)),
    vscode.commands.registerCommand('cpTestcases.runSingle', (testcaseId) => runSingleTestCase(sidebar, testcaseId)),
    vscode.commands.registerCommand('cpTestcases.deleteTestCase', (testcaseId) => deleteTestCase(sidebar, testcaseId)),
    vscode.commands.registerCommand('cpTestcases.openFile', (payload) => openFileItem(payload)),
    vscode.commands.registerCommand('cpTestcases.openHelp', () => openHelp())
  );
}

function deactivate() {}

class TestcaseSidebarProvider {
  constructor(context) {
    this.context = context;
    this.webviewView = undefined;
    this.state = {
      testcases: [],
      summary: { total: 0, passed: 0, failed: 0 },
      workspaceName: getWorkspaceName(),
      hasWorkspace: Boolean(vscode.workspace.workspaceFolders?.length),
      focusTarget: null
    };
    this.statusById = new Map();
    this.busy = false;
  }

  async resolveWebviewView(webviewView) {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message));

    await this.refresh();
  }

  async handleMessage(message) {
    if (!message?.type) {
      return;
    }

    if (message.type === 'addTestcase') {
      await vscode.commands.executeCommand('cpTestcases.addTestCase');
      return;
    }

    if (message.type === 'runAll') {
      await vscode.commands.executeCommand('cpTestcases.runAll');
      return;
    }

    if (message.type === 'runOne') {
      await vscode.commands.executeCommand('cpTestcases.runSingle', message.testcaseId);
      return;
    }

    if (message.type === 'deleteOne') {
      await vscode.commands.executeCommand('cpTestcases.deleteTestCase', message.testcaseId);
      return;
    }

    if (message.type === 'openFile') {
      await vscode.commands.executeCommand('cpTestcases.openFile', {
        testcaseId: message.testcaseId,
        fileName: message.fileName
      });
      return;
    }

    if (message.type === 'copyFile') {
      await copyTestcaseFile(message.testcaseId, message.fileName, message.content || '');
      return;
    }

    if (message.type === 'loadTestcaseContent') {
      await this.postTestcaseContent(message.testcaseId);
      return;
    }

    if (message.type === 'importFile') {
      await importTestcaseFile(this, message.testcaseId, message.fileName);
      return;
    }

    if (message.type === 'saveFile') {
      await saveTestcaseFile(message.testcaseId, message.fileName, message.content || '');
      return;
    }

    if (message.type === 'help') {
      await vscode.commands.executeCommand('cpTestcases.openHelp');
    }
  }

  async refresh() {
    this.state.workspaceName = getWorkspaceName();
    this.state.hasWorkspace = Boolean(vscode.workspace.workspaceFolders?.length);
    if (this.state.hasWorkspace) {
      this.state.testcases = await getTestcasesForUi(this.statusById);
      this.state.summary = buildSummary(this.state.testcases);
    } else {
      this.state.testcases = [];
      this.state.summary = { total: 0, passed: 0, failed: 0 };
    }
    this.postState();
  }

  postState() {
    if (!this.webviewView) {
      return;
    }

    const payload = {
      ...this.state,
      busy: this.busy
    };

    this.webviewView.webview.postMessage({
      type: 'state',
      payload
    });
    this.state.focusTarget = null;
  }

  setBusy(busy) {
    this.busy = busy;
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.postMessage({
      type: 'busy',
      payload: { busy }
    });
  }

  setStatus(testcaseId, status) {
    this.statusById.set(testcaseId, status);
  }

  requestFocus(testcaseId, fileName = INPUT_FILE) {
    this.state.focusTarget = `${testcaseId}|${fileName}`;
  }

  resetTestcaseContent(testcaseId) {
    if (!this.webviewView) {
      return;
    }

    this.webviewView.webview.postMessage({
      type: 'resetTestcaseContent',
      payload: { testcaseId }
    });
  }

  async postTestcaseContent(testcaseId) {
    if (!this.webviewView) {
      return;
    }

    const content = await readTestcaseContent(testcaseId);
    if (!content) {
      return;
    }

    this.webviewView.webview.postMessage({
      type: 'testcaseContent',
      payload: content
    });
  }

  getHtml(webview) {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>CP Testcases</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111315;
      --panel: rgba(255, 255, 255, 0.04);
      --panel-strong: rgba(255, 255, 255, 0.08);
      --panel-border: rgba(255, 255, 255, 0.08);
      --muted: #97a1ab;
      --text: #f4f7fb;
      --accent: #57a6ff;
      --accent-2: #8ad0ff;
      --success: #84c658;
      --danger: #e96b7a;
      --warning: #e6b95c;
      --surface-glow: radial-gradient(circle at top, rgba(87, 166, 255, 0.16), transparent 40%);
      --shadow: 0 14px 30px rgba(0, 0, 0, 0.24);
      --radius: 18px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.02), transparent 18%),
        linear-gradient(180deg, #101214 0%, #17191c 100%);
      color: var(--text);
    }

    .shell {
      min-height: 100vh;
      padding: 14px 12px 20px;
      background-image: var(--surface-glow);
    }

    .hero {
      border: 1px solid var(--panel-border);
      background:
        linear-gradient(145deg, rgba(87,166,255,0.15), rgba(255,255,255,0.02)),
        rgba(18, 22, 26, 0.9);
      border-radius: 22px;
      padding: 16px;
      box-shadow: var(--shadow);
      position: sticky;
      top: 0;
      z-index: 2;
      backdrop-filter: blur(8px);
    }

    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent-2);
      margin-bottom: 8px;
    }

    .hero-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }

    .workspace {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .subtle {
      color: var(--muted);
      font-size: 12px;
      margin-top: 6px;
    }

    .score {
      min-width: 78px;
      text-align: right;
      padding: 8px 10px;
      border-radius: 14px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      color: #d5dde5;
      font-size: 12px;
      flex: 0 0 auto;
    }

    .score strong {
      display: block;
      font-size: 20px;
      color: white;
    }

    .hero-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 14px;
    }

    button {
      appearance: none;
      border: 0;
      cursor: pointer;
      color: white;
      border-radius: 12px;
      padding: 11px 12px;
      font-weight: 600;
      font-size: 13px;
      transition: transform 120ms ease, opacity 120ms ease, box-shadow 120ms ease;
    }

    button:hover {
      transform: translateY(-1px);
    }

    button:active {
      transform: translateY(0);
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      transform: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, #4d9df8, #3278cb);
      box-shadow: 0 10px 20px rgba(61, 132, 216, 0.26);
    }

    .btn-secondary {
      background: linear-gradient(135deg, #7cab42, #5d862f);
      box-shadow: 0 10px 20px rgba(93, 134, 47, 0.24);
    }

    .btn-ghost {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.08);
      color: #dbe6f2;
    }

    .hint {
      margin-top: 10px;
      font-size: 12px;
      color: var(--muted);
    }

    .stack {
      display: grid;
      gap: 12px;
      margin-top: 14px;
    }

    .empty {
      text-align: center;
      padding: 20px 14px 16px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02));
      border: 1px solid var(--panel-border);
      box-shadow: var(--shadow);
    }

    .empty-badge {
      width: 54px;
      height: 54px;
      margin: 0 auto 14px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(87,166,255,0.28), rgba(138,208,255,0.1));
      display: grid;
      place-items: center;
      font-size: 22px;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 700;
    }

    .empty-copy {
      margin: 10px 0 16px;
      color: var(--muted);
      line-height: 1.45;
    }

    .card {
      border-radius: var(--radius);
      padding: 12px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02)),
        rgba(20, 22, 25, 0.95);
      border: 1px solid var(--panel-border);
      box-shadow: var(--shadow);
    }

    .card.pass {
      border-color: rgba(132, 198, 88, 0.32);
    }

    .card.fail {
      border-color: rgba(233, 107, 122, 0.34);
    }

    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }

    .title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }

    .chevron {
      width: 30px;
      height: 30px;
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04));
      border: 1px solid rgba(255,255,255,0.08);
      display: grid;
      place-items: center;
      color: #d8e2ef;
      flex: 0 0 auto;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
      transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
      position: relative;
    }

    .chevron::before {
      content: "";
      width: 8px;
      height: 8px;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      transform: rotate(45deg) translateY(-1px);
      transform-origin: center;
      display: block;
    }

    details[open] .chevron::before {
      transform: rotate(45deg) translateY(-1px);
    }

    details:not([open]) .chevron::before {
      transform: rotate(-45deg) translateX(-1px);
    }

    details:hover .chevron {
      background: linear-gradient(180deg, rgba(87,166,255,0.16), rgba(255,255,255,0.05));
      border-color: rgba(87,166,255,0.28);
    }

    .name-wrap {
      min-width: 0;
    }

    .name {
      font-size: 15px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status {
      margin-top: 3px;
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .icon-btn {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      padding: 0;
      font-size: 14px;
      display: grid;
      place-items: center;
    }

    .run-btn {
      background: linear-gradient(135deg, #7bab42, #5c862f);
    }

    .delete-btn {
      background: linear-gradient(135deg, #d95667, #b73950);
    }

    .open-btn {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.08);
    }

    .fields {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }

    .field {
      border-radius: 14px;
      padding: 10px;
      background: rgba(0,0,0,0.16);
      border: 1px solid rgba(255,255,255,0.06);
    }

    .field-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 7px;
      flex-wrap: wrap;
    }

    .field-label {
      font-size: 12px;
      font-weight: 700;
      color: #dce7f5;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .field-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }

    .mini {
      font-size: 11px;
      color: var(--muted);
      background: transparent;
      padding: 0;
    }

    textarea, pre.output {
      width: 100%;
      min-height: 76px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(6, 10, 14, 0.78);
      color: #f3f7fb;
      padding: 10px;
      font: 12px/1.45 Consolas, "Courier New", monospace;
      resize: vertical;
      outline: none;
    }

    textarea:focus {
      border-color: rgba(87,166,255,0.9);
      box-shadow: 0 0 0 1px rgba(87,166,255,0.5);
    }

    pre.output {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: #dbe7f7;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      font-size: 11px;
      border-radius: 999px;
      background: rgba(255,255,255,0.07);
      color: #dfe7ef;
    }

    .pill.pass {
      background: rgba(132,198,88,0.16);
      color: #bce59a;
    }

    .pill.fail {
      background: rgba(233,107,122,0.16);
      color: #ffb3bc;
    }

    .footer-space {
      height: 10px;
    }

    @media (max-width: 360px) {
      .shell {
        padding: 10px 8px 16px;
      }

      .hero {
        padding: 14px 12px;
        border-radius: 18px;
      }

      .hero-row {
        flex-direction: column;
        align-items: stretch;
      }

      .score {
        min-width: 0;
        width: 100%;
        text-align: left;
      }

      .hero-actions {
        grid-template-columns: 1fr;
      }

      .card {
        padding: 10px;
        border-radius: 16px;
      }

      .card-head {
        flex-direction: column;
        align-items: stretch;
      }

      .title-wrap {
        width: 100%;
      }

      .toolbar {
        width: 100%;
        justify-content: flex-start;
      }

      .pill {
        order: -1;
      }

      .field {
        padding: 9px;
      }

      textarea, pre.output {
        min-height: 68px;
      }
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = {
      testcases: [],
      summary: { total: 0, passed: 0, failed: 0 },
      workspaceName: 'Workspace',
      hasWorkspace: true,
      busy: false
    };
    const saveTimers = new Map();
    const testcaseContent = new Map();
    const openTestcases = new Set();
    const MAX_INLINE_EDITOR_CHARS = 200000;

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        state = message.payload;
        render();
        applyRequestedFocus();
        return;
      }

      if (message.type === 'busy') {
        state = { ...state, busy: message.payload.busy };
        updateBusyUi();
        return;
      }

      if (message.type === 'testcaseContent') {
        testcaseContent.set(message.payload.testcaseId, message.payload);
        render();
        applyRequestedFocus();
        return;
      }

      if (message.type === 'resetTestcaseContent') {
        const testcaseId = message.payload?.testcaseId;
        if (testcaseId) {
          testcaseContent.delete(testcaseId);
          openTestcases.delete(testcaseId);
        }
      }
    });

    function send(type, payload = {}) {
      vscode.postMessage({ type, ...payload });
    }

    function render() {
      const app = document.getElementById('app');
      const passedText = state.summary.total ? state.summary.passed + ' / ' + state.summary.total + ' passed' : 'No runs yet';

      app.innerHTML = \`
        <div class="shell">
          <section class="hero">
            <div class="eyebrow">CP Judge Dashboard</div>
            <div class="hero-row">
              <div>
                <div class="workspace">\${escapeHtml(state.workspaceName)}</div>
                <div class="subtle">Build once, edit quickly, and judge every testcase from one place.</div>
              </div>
              <div class="score"><strong>\${state.summary.passed}</strong>\${escapeHtml(passedText)}</div>
            </div>
            <div class="hero-actions">
              <button class="btn-primary" data-action="add" \${state.busy ? 'disabled' : ''}>＋ New Testcase</button>
              <button class="btn-secondary" data-action="runAll" \${state.busy ? 'disabled' : ''}>▶ Run All</button>
            </div>
            <div class="hint">Tip: collapse cards anytime and keep only the testcase you are working on open.</div>
          </section>

          <div id="inline-message"></div>
          <div class="stack">
            \${state.hasWorkspace ? renderCases() : renderNoWorkspace()}
          </div>
          <div class="footer-space"></div>
        </div>
      \`;

      bindGlobalActions();
      bindCaseActions();
      bindDetailsToggles();
    }

    function applyRequestedFocus() {
      if (!state.focusTarget) {
        return;
      }

      const testcaseId = state.focusTarget.split('|')[0];
      openTestcases.add(testcaseId);
      if (!testcaseContent.has(testcaseId)) {
        send('loadTestcaseContent', { testcaseId });
        return;
      }

      const selector = '[data-editor="' + cssEscape(state.focusTarget) + '"]';
      const editor = document.querySelector(selector);
      if (!editor) {
        return;
      }

      requestAnimationFrame(() => {
        editor.focus();
        const end = editor.value.length;
        editor.setSelectionRange(end, end);
        state = { ...state, focusTarget: null };
      });
    }

    function updateBusyUi() {
      document.querySelectorAll('[data-disable-on-busy]').forEach((element) => {
        element.disabled = Boolean(state.busy);
      });
    }

    function showInlineMessage(text) {
      const host = document.getElementById('inline-message');
      if (!host) {
        return;
      }

      host.innerHTML = text
        ? '<div style="margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(233,107,122,0.12);border:1px solid rgba(233,107,122,0.28);color:#ffd2d8;font-size:12px;line-height:1.4;">' + escapeHtml(text) + '</div>'
        : '';
    }

    function bindDetailsToggles() {
      document.querySelectorAll('details[data-testid]').forEach((element) => {
        element.addEventListener('toggle', () => {
          const testcaseId = element.dataset.testid;
          if (!testcaseId) {
            return;
          }

          if (element.open) {
            openTestcases.add(testcaseId);
            if (!testcaseContent.has(testcaseId)) {
              send('loadTestcaseContent', { testcaseId });
            }
          } else {
            openTestcases.delete(testcaseId);
          }
        });
      });
    }

    function renderNoWorkspace() {
      return \`
        <section class="empty">
          <div class="empty-badge">⌘</div>
          <div class="empty-title">Open a folder first</div>
          <div class="empty-copy">This sidebar needs a workspace so it can store testcase files and compile your program.</div>
        </section>
      \`;
    }

    function renderCases() {
      if (!state.testcases.length) {
        return \`
          <section class="empty">
            <div class="empty-badge">🧪</div>
            <div class="empty-title">No testcase arena yet</div>
            <div class="empty-copy">Create your first testcase, paste sample input and expected output, then run everything from here.</div>
            <button class="btn-primary" data-action="add" \${state.busy ? 'disabled' : ''}>＋ Create First Testcase</button>
            <div style="height:10px"></div>
            <button class="btn-secondary" data-action="help">How to use this extension</button>
          </section>
        \`;
      }

      return state.testcases.map(renderCard).join('');
    }

    function renderCard(testcase) {
      const pillClass = testcase.status === 'pass' ? 'pill pass' : testcase.status === 'fail' ? 'pill fail' : 'pill';
      const cardClass = testcase.status === 'pass' ? 'card pass' : testcase.status === 'fail' ? 'card fail' : 'card';
      const content = testcaseContent.get(testcase.id);
      const inputInfo = content?.input;
      const expectedInfo = content?.expected;
      const outputInfo = content?.output;
      const isOpen = openTestcases.has(testcase.id) || (state.focusTarget || '').startsWith(testcase.id + '|');
      const inputField = '<pre class="output">Expand this testcase to load its content.</pre>';
      const expectedField = '<pre class="output">Expand this testcase to load its content.</pre>';
      const outputField = 'Expand this testcase to load its content.';
      const resolvedInputField = inputInfo
        ? renderInlineField(testcase.id, 'input.txt', inputInfo)
        : inputField;
      const resolvedExpectedField = expectedInfo
        ? renderInlineField(testcase.id, 'expected_output.txt', expectedInfo)
        : expectedField;
      const resolvedOutputField = outputInfo
        ? renderOutputField(outputInfo)
        : outputField;

      return \`
        <details class="\${cardClass}" data-testid="\${escapeAttr(testcase.id)}" \${isOpen ? 'open' : ''}>
          <summary class="card-head">
            <div class="title-wrap">
              <div class="chevron" aria-hidden="true"></div>
              <div class="name-wrap">
                <div class="name">\${escapeHtml(testcase.name)}</div>
                <div class="status">\${escapeHtml(testcase.statusLabel)}</div>
              </div>
            </div>
            <div class="toolbar">
              <span class="\${pillClass}">\${escapeHtml(testcase.badge)}</span>
              <button class="icon-btn run-btn" title="Run testcase" data-run="\${escapeAttr(testcase.id)}" \${state.busy ? 'disabled' : ''}>▶</button>
              <button class="icon-btn delete-btn" title="Delete testcase" data-delete="\${escapeAttr(testcase.id)}" \${state.busy ? 'disabled' : ''}>🗑</button>
            </div>
          </summary>

          <div class="fields">
            <section class="field">
              <div class="field-head">
                <div class="field-label">Input</div>
                <div class="field-actions">
                  <button class="mini" data-import="\${escapeAttr(testcase.id)}|input.txt">Import</button>
                  <button class="mini" data-open="\${escapeAttr(testcase.id)}|input.txt">Open</button>
                  <button class="mini" data-copy="\${escapeAttr(testcase.id)}|input.txt">Copy</button>
                </div>
              </div>
              \${resolvedInputField}
            </section>

            <section class="field">
              <div class="field-head">
                <div class="field-label">Expected Output</div>
                <div class="field-actions">
                  <button class="mini" data-import="\${escapeAttr(testcase.id)}|expected_output.txt">Import</button>
                  <button class="mini" data-open="\${escapeAttr(testcase.id)}|expected_output.txt">Open</button>
                  <button class="mini" data-copy="\${escapeAttr(testcase.id)}|expected_output.txt">Copy</button>
                </div>
              </div>
              \${resolvedExpectedField}
            </section>

            <section class="field">
              <div class="field-head">
                <div class="field-label">Last Output</div>
                <div class="field-actions">
                  <button class="mini" data-open="\${escapeAttr(testcase.id)}|output.txt">Open</button>
                  <button class="mini" data-copy="\${escapeAttr(testcase.id)}|output.txt">Copy</button>
                </div>
              </div>
              \${resolvedOutputField}
            </section>
          </div>
        </details>
      \`;
    }

    function renderInlineField(testcaseId, fileName, fileInfo) {
      if (fileInfo.tooLarge) {
        return '<pre class="output">This file is too large for inline view (' + formatBytes(fileInfo.sizeBytes) + '). Use Open or Copy instead.</pre>';
      }

      return '<textarea data-editor="' + escapeAttr(testcaseId) + '|' + fileName + '" spellcheck="false">' + escapeHtml(fileInfo.text || '') + '</textarea>';
    }

    function renderOutputField(fileInfo) {
      if (fileInfo.tooLarge) {
        return '<pre class="output">This file is too large for inline view (' + formatBytes(fileInfo.sizeBytes) + '). Use Open or Copy instead.</pre>';
      }

      return '<pre class="output">' + escapeHtml(fileInfo.text || 'Run this testcase to see generated output here.') + '</pre>';
    }

    function formatBytes(bytes) {
      if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }
      if (bytes >= 1024) {
        return Math.round(bytes / 1024) + ' KB';
      }
      return bytes + ' B';
    }

    function bindGlobalActions() {
      document.querySelectorAll('[data-action="add"]').forEach((button) => {
        button.onclick = () => send('addTestcase');
      });

      document.querySelectorAll('[data-action="runAll"]').forEach((button) => {
        button.onclick = () => send('runAll');
      });

      document.querySelectorAll('[data-action="help"]').forEach((button) => {
        button.onclick = () => send('help');
      });
    }

    function bindCaseActions() {
      document.querySelectorAll('[data-run]').forEach((button) => {
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          send('runOne', { testcaseId: button.dataset.run });
        };
      });

      document.querySelectorAll('[data-delete]').forEach((button) => {
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          send('deleteOne', { testcaseId: button.dataset.delete });
        };
      });

      document.querySelectorAll('[data-open]').forEach((button) => {
        button.onclick = (event) => {
          event.preventDefault();
          const [testcaseId, fileName] = button.dataset.open.split('|');
          send('openFile', { testcaseId, fileName });
        };
      });

      document.querySelectorAll('[data-import]').forEach((button) => {
        button.onclick = (event) => {
          event.preventDefault();
          const [testcaseId, fileName] = button.dataset.import.split('|');
          send('importFile', { testcaseId, fileName });
        };
      });

      document.querySelectorAll('[data-copy]').forEach((button) => {
        button.onclick = (event) => {
          event.preventDefault();
          const [testcaseId, fileName] = button.dataset.copy.split('|');
          let content = '';
          if (fileName === 'output.txt') {
            const card = button.closest('.field');
            const output = card ? card.querySelector('.output') : null;
            content = output ? output.innerText : '';
          } else {
            const editor = document.querySelector('[data-editor="' + cssEscape(button.dataset.copy) + '"]');
            content = editor ? editor.value : '';
          }
          send('copyFile', { testcaseId, fileName, content });
        };
      });

      document.querySelectorAll('textarea[data-editor]').forEach((editor) => {
        editor.addEventListener('paste', (event) => {
          const pastedText = event.clipboardData ? event.clipboardData.getData('text') : '';
          const selectionLength = Math.max(0, (editor.selectionEnd || 0) - (editor.selectionStart || 0));
          const nextLength = editor.value.length - selectionLength + pastedText.length;

          if (nextLength > MAX_INLINE_EDITOR_CHARS) {
            event.preventDefault();
            showInlineMessage('That paste is too large for the sidebar editor. Use Open to edit the file directly.');
            return;
          }

          showInlineMessage('');
        });

        editor.addEventListener('input', () => {
          const key = editor.dataset.editor;
          if (!key) {
            return;
          }

          if (editor.value.length > MAX_INLINE_EDITOR_CHARS) {
            showInlineMessage('This testcase is getting too large for inline editing. Use Open for large files.');
            return;
          }

          if (saveTimers.has(key)) {
            clearTimeout(saveTimers.get(key));
          }

          saveTimers.set(
            key,
            setTimeout(() => {
              const [testcaseId, fileName] = key.split('|');
              send('saveFile', { testcaseId, fileName, content: editor.value });
              saveTimers.delete(key);
              showInlineMessage('');
            }, 500)
          );
        });
      });
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/"/g, '&quot;');
    }

    function cssEscape(value) {
      if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value);
      }
      return String(value).replace(/["\\\\]/g, '\\\\$&');
    }

    render();
  </script>
</body>
</html>`;
  }
}

async function addTestCase(sidebar) {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter a name for the new test case',
    placeHolder: 'Example: sample-1',
    validateInput(value) {
      return value.trim() ? null : 'Name is required.';
    }
  });

  if (!name) {
    return;
  }

  const root = getWorkspaceRoot();
  const folder = getTestcasesRoot();
  await fs.promises.mkdir(folder, { recursive: true });

  const slug = toSlug(name);
  const testcaseDir = path.join(folder, slug);
  if (fs.existsSync(testcaseDir)) {
    vscode.window.showErrorMessage(`A testcase named "${slug}" already exists.`);
    return;
  }

  await fs.promises.mkdir(testcaseDir, { recursive: true });
  await fs.promises.writeFile(path.join(testcaseDir, TESTCASE_META), JSON.stringify({ name }, null, 2));
  await fs.promises.writeFile(path.join(testcaseDir, INPUT_FILE), '');
  await fs.promises.writeFile(path.join(testcaseDir, EXPECTED_FILE), '');
  await fs.promises.writeFile(path.join(testcaseDir, OUTPUT_FILE), '');

  sidebar.resetTestcaseContent(slug);
  sidebar.setStatus(slug, 'idle');
  sidebar.requestFocus(slug, INPUT_FILE);
  await sidebar.refresh();
}

async function runAllTestCases(sidebar) {
  const testcases = await readAllTestcases();
  if (!testcases.length) {
    vscode.window.showWarningMessage('No testcases found. Use "Add Test Case" first.');
    return;
  }

  await withProgress('Running all testcases', sidebar, async (progress) => {
    const runner = await buildRunner();
    logNonCritical(runner.warningMessage);
    let passed = 0;
    let failed = 0;

    try {
      for (let index = 0; index < testcases.length; index += 1) {
        const testcase = testcases[index];
        progress.report({
          message: `${testcase.name} (${index + 1}/${testcases.length})`,
          increment: 100 / testcases.length
        });

        const result = await executeTestcase(runner, testcase);
        sidebar.setStatus(testcase.id, result.passed ? 'pass' : 'fail');
        await sidebar.postTestcaseContent(testcase.id);
        if (result.passed) {
          passed += 1;
        } else {
          failed += 1;
        }
      }
    } finally {
      cleanupRunner(runner);
    }

  });
}

async function runSingleTestCase(sidebar, testcaseId) {
  const testcases = await readAllTestcases();
  const testcase = testcases.find((item) => item.id === testcaseId);
  if (!testcase) {
    return;
  }

  await withProgress(`Running ${testcase.name}`, sidebar, async () => {
    const runner = await buildRunner();
    logNonCritical(runner.warningMessage);
    try {
      const result = await executeTestcase(runner, testcase);
      sidebar.setStatus(testcase.id, result.passed ? 'pass' : 'fail');
      await sidebar.postTestcaseContent(testcase.id);
    } finally {
      cleanupRunner(runner);
    }
  });
}

async function deleteTestCase(sidebar, testcaseId) {
  const testcases = await readAllTestcases();
  const testcase = testcases.find((item) => item.id === testcaseId);
  if (!testcase) {
    return;
  }

  const choice = await vscode.window.showWarningMessage(
    `Delete testcase "${testcase.name}"?`,
    { modal: true },
    'Delete'
  );

  if (choice !== 'Delete') {
    return;
  }

  await fs.promises.rm(testcase.dir, { recursive: true, force: true });
  sidebar.statusById.delete(testcase.id);
  sidebar.resetTestcaseContent(testcase.id);
  await sidebar.refresh();
}

async function openFileItem(payload) {
  const filePath = await resolveTestcaseFilePath(payload?.testcaseId, payload?.fileName);
  if (!filePath) {
    return;
  }

  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
}

async function copyTestcaseFile(testcaseId, fileName, content) {
  const allowed = new Set([INPUT_FILE, EXPECTED_FILE, OUTPUT_FILE]);
  if (!allowed.has(fileName)) {
    return;
  }

  if (!content) {
    const filePath = await resolveTestcaseFilePath(testcaseId, fileName);
    if (!filePath) {
      return;
    }
    content = await readFileOrEmpty(filePath);
  }

  await vscode.env.clipboard.writeText(content);
}

async function importTestcaseFile(sidebar, testcaseId, fileName) {
  const allowed = new Set([INPUT_FILE, EXPECTED_FILE]);
  if (!allowed.has(fileName)) {
    return;
  }

  const selection = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: `Import into ${fileName}`
  });

  if (!selection?.length) {
    return;
  }

  const sourcePath = selection[0].fsPath;
  const targetPath = await resolveTestcaseFilePath(testcaseId, fileName);
  if (!targetPath) {
    return;
  }

  await fs.promises.copyFile(sourcePath, targetPath);
  await sidebar.postTestcaseContent(testcaseId);
}

async function openHelp() {
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: [
      '# CP Testcases',
      '',
      '1. Click **New Testcase** to create a testcase folder.',
      '2. Paste sample input and expected output into the sidebar editors.',
      '3. Click **Run All** or the play button on a single testcase.',
      '4. Inspect the generated `output.txt` from the card or open it as a file.'
    ].join('\n')
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function getTestcasesForUi(statusById) {
  const testcases = await readAllTestcases();
  return testcases.map((testcase) => {
    const status = statusById.get(testcase.id) || 'idle';

    return {
      id: testcase.id,
      name: testcase.name,
      status,
      statusLabel: status === 'pass' ? 'Passed' : status === 'fail' ? 'Failed' : 'Ready to run',
      badge: status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'IDLE'
    };
  });
}

async function readTestcaseContent(testcaseId) {
  const testcases = await readAllTestcases();
  const testcase = testcases.find((item) => item.id === testcaseId);
  if (!testcase) {
    return undefined;
  }

  return {
    testcaseId,
    input: await readInlineFileData(path.join(testcase.dir, INPUT_FILE)),
    expected: await readInlineFileData(path.join(testcase.dir, EXPECTED_FILE)),
    output: await readInlineFileData(path.join(testcase.dir, OUTPUT_FILE))
  };
}

function buildSummary(testcases) {
  const passed = testcases.filter((item) => item.status === 'pass').length;
  const failed = testcases.filter((item) => item.status === 'fail').length;
  return {
    total: testcases.length,
    passed,
    failed
  };
}

async function saveTestcaseFile(testcaseId, fileName, content) {
  const filePath = await resolveTestcaseFilePath(testcaseId, fileName);
  if (!filePath) {
    return;
  }
  await fs.promises.writeFile(filePath, content);
}

async function resolveTestcaseFilePath(testcaseId, fileName) {
  if (!testcaseId || !fileName) {
    return undefined;
  }

  const allowed = new Set([INPUT_FILE, EXPECTED_FILE, OUTPUT_FILE]);
  if (!allowed.has(fileName)) {
    return undefined;
  }

  const testcases = await readAllTestcases();
  const testcase = testcases.find((item) => item.id === testcaseId);
  if (!testcase) {
    return undefined;
  }

  return path.join(testcase.dir, fileName);
}

async function readAllTestcases() {
  const folder = getTestcasesRoot();
  if (!fs.existsSync(folder)) {
    return [];
  }

  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const testcaseDir = path.join(folder, entry.name);
    const metaPath = path.join(testcaseDir, TESTCASE_META);
    let name = entry.name;

    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'));
        name = meta.name || name;
      } catch {
        // Ignore malformed metadata and fall back to the folder name.
      }
    }

    results.push({
      id: entry.name,
      name,
      dir: testcaseDir
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

async function buildRunner() {
  const source = await resolveSourceFile();
  if (!source) {
    throw new Error('No supported source file found. Open or configure a .cpp, .c, .py, or .java file.');
  }

  if (source.language === 'python') {
    return buildPythonRunner(source);
  }

  if (source.language === 'java') {
    return buildJavaRunner(source);
  }

  if (source.language === 'c') {
    return buildNativeRunner(source, {
      compilerConfigKey: 'cCompiler',
      argsConfigKey: 'cCompilerArgs',
      defaultCompiler: 'gcc',
      defaultArgs: ['-O2']
    });
  }

  return buildNativeRunner(source, {
    compilerConfigKey: 'cppCompiler',
    argsConfigKey: 'cppCompilerArgs',
    defaultCompiler: 'g++',
    defaultArgs: ['-std=gnu++17', '-O2']
  });
}

async function executeTestcase(runner, testcase) {
  const inputPath = path.join(testcase.dir, INPUT_FILE);
  const expectedPath = path.join(testcase.dir, EXPECTED_FILE);
  const outputPath = path.join(testcase.dir, OUTPUT_FILE);
  const input = fs.existsSync(inputPath) ? await fs.promises.readFile(inputPath, 'utf8') : '';
  const expected = fs.existsSync(expectedPath) ? await fs.promises.readFile(expectedPath, 'utf8') : '';

  const execution = await runProcess(runner.command, runner.args || [], {
    cwd: getWorkspaceRoot(),
    input
  });

  if (execution.code !== 0) {
    const stderr = execution.stderr?.trim();
    const output = stderr ? `${execution.stdout}\n${stderr}`.trim() : execution.stdout.trim();
    await fs.promises.writeFile(outputPath, output);
    showStderrOutput(
      `Runtime error in ${testcase.name}`,
      [
        `Command: ${runner.command} ${(runner.args || []).join(' ')}`.trim(),
        '',
        execution.stderr || execution.stdout || 'Process exited with a non-zero code and no stderr was captured.'
      ].join('\n')
    );
    return { passed: false, reason: 'runtime-error' };
  }

  await fs.promises.writeFile(outputPath, execution.stdout);
  const passed = compareOutput(execution.stdout, expected);
  return { passed };
}

function compareOutput(actual, expected) {
  const ignoreWhitespace = vscode.workspace.getConfiguration('cpTestcases').get('ignoreWhitespace', true);
  if (!ignoreWhitespace) {
    return actual === expected;
  }
  return normalizeWhitespace(actual) === normalizeWhitespace(expected);
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function resolveSourceFile() {
  const configured = vscode.workspace.getConfiguration('cpTestcases').get('sourceFile', '').trim();
  if (configured) {
    return toSourceDescriptor(path.join(getWorkspaceRoot(), configured));
  }

  const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
  if (activePath) {
    const activeSource = toSourceDescriptor(activePath);
    if (activeSource) {
      return activeSource;
    }
  }

  const files = await vscode.workspace.findFiles('**/*.{cpp,cc,cxx,c,py,java}', '**/node_modules/**', 50);
  if (files.length === 1) {
    return toSourceDescriptor(files[0].fsPath);
  }

  if (files.length > 1) {
    const picked = await vscode.window.showQuickPick(
      files.map((file) => ({
        label: path.relative(getWorkspaceRoot(), file.fsPath),
        description: describeLanguage(file.fsPath),
        filePath: file.fsPath
      })),
      { placeHolder: 'Pick the source file to run' }
    );
    return picked?.filePath ? toSourceDescriptor(picked.filePath) : undefined;
  }

  return undefined;
}

function getWorkspaceRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Open a workspace folder before using CP Testcases.');
  }
  return folder.uri.fsPath;
}

function getWorkspaceName() {
  return vscode.workspace.workspaceFolders?.[0]?.name || 'No workspace';
}

function getTestcasesRoot() {
  const folderName = vscode.workspace.getConfiguration('cpTestcases').get('testcasesFolder', '.cp-testcases');
  return path.join(getWorkspaceRoot(), folderName);
}

function toSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-');
}

async function readFileOrEmpty(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.promises.readFile(filePath, 'utf8');
}

async function readInlineFileData(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      text: '',
      tooLarge: false,
      sizeBytes: 0
    };
  }

  const stats = await fs.promises.stat(filePath);
  if (stats.size > MAX_INLINE_FILE_BYTES) {
    return {
      text: '',
      tooLarge: true,
      sizeBytes: stats.size
    };
  }

  return {
    text: await fs.promises.readFile(filePath, 'utf8'),
    tooLarge: false,
    sizeBytes: stats.size
  };
}

function toCompilerPath(filePath) {
  if (process.platform !== 'win32') {
    return filePath;
  }
  return filePath.replace(/\\/g, '/');
}

function toSourceDescriptor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.cpp', '.cc', '.cxx'].includes(ext)) {
    return { filePath, language: 'cpp' };
  }
  if (ext === '.c') {
    return { filePath, language: 'c' };
  }
  if (ext === '.py') {
    return { filePath, language: 'python' };
  }
  if (ext === '.java') {
    return { filePath, language: 'java' };
  }
  return undefined;
}

function describeLanguage(filePath) {
  const source = toSourceDescriptor(filePath);
  if (!source) {
    return '';
  }
  if (source.language === 'cpp') {
    return 'C++';
  }
  if (source.language === 'c') {
    return 'C';
  }
  if (source.language === 'python') {
    return 'Python';
  }
  return 'Java';
}

async function buildPythonRunner(source) {
  const pythonCommand = vscode.workspace.getConfiguration('cpTestcases').get('pythonCommand', 'python');
  return {
    command: pythonCommand,
    args: [source.filePath],
    tempDir: undefined,
    warningMessage: '',
    language: source.language
  };
}

async function buildJavaRunner(source) {
  const javaCompiler = vscode.workspace.getConfiguration('cpTestcases').get('javaCompiler', 'javac');
  const javaCommand = vscode.workspace.getConfiguration('cpTestcases').get('javaCommand', 'java');
  const javaCompilerArgs = vscode.workspace.getConfiguration('cpTestcases').get('javaCompilerArgs', []);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cp-testcases-java-'));
  const compileSource = toCompilerPath(source.filePath);
  const compileOutput = toCompilerPath(tempDir);
  const className = await resolveJavaClassName(source.filePath);
  const packageName = await resolveJavaPackageName(source.filePath);
  const launchClass = packageName ? `${packageName}.${className}` : className;
  const compileArgs = [...javaCompilerArgs, '-d', compileOutput, compileSource];
  const compile = await runProcess(javaCompiler, compileArgs, {
    cwd: getWorkspaceRoot()
  });

  if (compile.code !== 0) {
    const output = [compile.stdout, compile.stderr].filter(Boolean).join('\n');
    showStderrOutput(
      'Compilation failed',
      [
        `Command: ${javaCompiler} ${compileArgs.join(' ')}`,
        '',
        output
      ].join('\n')
    );
    throw new Error('Compilation failed. See "CP Testcases: stderr" for details.');
  }

  return {
    command: javaCommand,
    args: ['-cp', tempDir, launchClass],
    tempDir,
    warningMessage: '',
    language: source.language
  };
}

async function buildNativeRunner(source, options) {
  const compiler = vscode.workspace.getConfiguration('cpTestcases').get(options.compilerConfigKey, options.defaultCompiler);
  const compilerArgs = vscode.workspace.getConfiguration('cpTestcases').get(options.argsConfigKey, options.defaultArgs);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cp-testcases-'));
  const exePath = path.join(tempDir, process.platform === 'win32' ? 'program.exe' : 'program');
  const compileSource = toCompilerPath(source.filePath);
  const compileOutput = toCompilerPath(exePath);
  const primaryArgs = [...compilerArgs, compileSource, '-o', compileOutput];
  let compile = await runProcess(compiler, primaryArgs, {
    cwd: getWorkspaceRoot()
  });

  let finalArgs = primaryArgs;
  let fallbackMessage = '';
  let warningMessage = '';

  if (source.language === 'cpp' && compile.code !== 0 && shouldRetryWithGnuStd(compilerArgs, compile.stderr)) {
    const retryArgs = [
      ...swapToGnuCppStandard(compilerArgs),
      compileSource,
      '-o',
      compileOutput
    ];

    compile = await runProcess(compiler, retryArgs, {
      cwd: getWorkspaceRoot()
    });

    finalArgs = retryArgs;
    fallbackMessage = 'Retried with GNU dialect for better MinGW compatibility.\n';
  }

  if (source.language === 'cpp' && compile.code !== 0 && shouldRetryWithCpp14Compat(compilerArgs, compile.stderr)) {
    const retryArgs = [
      ...swapToGnuCpp14(compilerArgs),
      compileSource,
      '-o',
      compileOutput
    ];

    compile = await runProcess(compiler, retryArgs, {
      cwd: getWorkspaceRoot()
    });

    finalArgs = retryArgs;
    fallbackMessage = 'Retried with GNU++14 compatibility mode because this MinGW 8.1 setup has a broken C++17 <bits/stdc++.h>/<filesystem> combination.\n';
    warningMessage = 'Compiled in GNU++14 compatibility mode. If you need C++17 features, please upgrade MinGW/GCC.';
  }

  if (compile.code !== 0) {
    const output = [compile.stdout, compile.stderr].filter(Boolean).join('\n');
    showStderrOutput(
      'Compilation failed',
      [
        fallbackMessage.trim(),
        `Command: ${compiler} ${finalArgs.join(' ')}`,
        '',
        output
      ].filter(Boolean).join('\n')
    );
    throw new Error('Compilation failed. See "CP Testcases: stderr" for details.');
  }

  return {
    command: exePath,
    args: [],
    tempDir,
    warningMessage,
    language: source.language
  };
}

async function resolveJavaClassName(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8');
  const publicMatch = content.match(/\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (publicMatch) {
    return publicMatch[1];
  }
  return path.basename(filePath, path.extname(filePath));
}

async function resolveJavaPackageName(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8');
  const match = content.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m);
  return match ? match[1] : '';
}

function shouldRetryWithGnuStd(compilerArgs, stderr) {
  const joinedArgs = compilerArgs.join(' ');
  return (
    joinedArgs.includes('-std=c++17') &&
    !joinedArgs.includes('-std=gnu++17') &&
    /fs_path\.h|stdc\+\+\.h|filesystem/i.test(stderr || '')
  );
}

function swapToGnuCppStandard(compilerArgs) {
  return compilerArgs.map((arg) => (arg === '-std=c++17' ? '-std=gnu++17' : arg));
}

function shouldRetryWithCpp14Compat(compilerArgs, stderr) {
  const joinedArgs = compilerArgs.join(' ');
  return (
    /-std=(c\+\+17|gnu\+\+17)/.test(joinedArgs) &&
    /bits\/stdc\+\+\.h|filesystem|fs_path\.h/i.test(stderr || '')
  );
}

function swapToGnuCpp14(compilerArgs) {
  return compilerArgs.map((arg) => {
    if (arg === '-std=c++17' || arg === '-std=gnu++17') {
      return '-std=gnu++14';
    }
    return arg;
  });
}

async function withProgress(title, sidebar, task) {
  sidebar.setBusy(true);
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false
      },
      task
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(message);
  } finally {
    sidebar.setBusy(false);
    await sidebar.refresh();
  }
}

function cleanupRunner(runner) {
  if (!runner?.tempDir) {
    return;
  }
  fs.promises.rm(runner.tempDir, { recursive: true, force: true }).catch(() => {});
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, args, {
      cwd: options.cwd,
      shell: false
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));

    if (typeof options.input === 'string') {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

function logNonCritical(message) {
  if (!message) {
    return;
  }
  if (!stderrChannel) {
    return;
  }
  stderrChannel.appendLine(`[info] ${message}`);
}

function showStderrOutput(title, details) {
  if (!stderrChannel) {
    return;
  }
  const timestamp = new Date().toISOString();
  stderrChannel.appendLine(`\n[${timestamp}] ${title}`);
  stderrChannel.appendLine(details);
  stderrChannel.show(true);
}

module.exports = {
  activate,
  deactivate
};

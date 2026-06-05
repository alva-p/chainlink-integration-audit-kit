import type { Finding, ScanResult, Severity } from "../types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function severityClass(severity: Severity): string {
  return `severity-${severity}`;
}

function findingCard(finding: Finding): string {
  return `
      <article class="finding ${severityClass(finding.severity)}">
        <header class="finding-header">
          <div>
            <p class="rule-id">${escapeHtml(finding.ruleId)}</p>
            <h3>${escapeHtml(finding.title)}</h3>
          </div>
          <div class="badges">
            <span class="badge severity">${escapeHtml(finding.severity)}</span>
            <span class="badge confidence">${escapeHtml(finding.confidence)} confidence</span>
          </div>
        </header>
        <dl class="meta">
          <div><dt>Location</dt><dd>${escapeHtml(finding.file)}:${finding.line}</dd></div>
          <div><dt>Manual Review</dt><dd>${finding.manualReviewRequired ? "Required" : "Optional"}</dd></div>
        </dl>
        <section>
          <h4>Description</h4>
          <p>${escapeHtml(finding.description)}</p>
        </section>
        <section>
          <h4>Risk</h4>
          <p>${escapeHtml(finding.risk)}</p>
        </section>
        <section>
          <h4>Recommendation</h4>
          <p>${escapeHtml(finding.recommendation)}</p>
        </section>
      </article>`;
}

export function renderHtml(result: ScanResult): string {
  const products = result.products.length > 0 ? result.products.join(", ") : "none detected";
  const excludedPaths = result.config.exclude.length > 0 ? result.config.exclude.join(", ") : "none";
  const generatedAt = new Date().toISOString();
  const findings = result.findings.length > 0
    ? result.findings.map(findingCard).join("\n")
    : '<section class="empty">No potential Chainlink integration issues found by MVP rules. Manual review still required.</section>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chainlink Integration Audit Report</title>
  <script>
    (function () {
      var storedTheme = localStorage.getItem("chainlink-audit-theme");
      var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = storedTheme || (systemDark ? "dark" : "light");
    })();
  </script>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f9fc;
      --panel: #ffffff;
      --panel-strong: #f8fafc;
      --text: #111827;
      --muted: #5b6472;
      --border: #d8dee9;
      --high: #b42318;
      --medium: #b54708;
      --low: #175cd3;
      --info: #475467;
      --accent: #0f5fff;
      --accent-soft: #eef4ff;
      --accent-border: #c7d7fe;
      --accent-text: #253b74;
      --shadow: 0 1px 2px rgb(16 24 40 / 4%);
    }
    :root[data-theme="dark"] {
      --bg: #0f1115;
      --panel: #171a21;
      --panel-strong: #20242d;
      --text: #eef2f7;
      --muted: #a7b0bf;
      --border: #303642;
      --high: #ff8a80;
      --medium: #ffbf66;
      --low: #70b8ff;
      --info: #c4cad4;
      --accent: #72a7ff;
      --accent-soft: #172033;
      --accent-border: #2f4975;
      --accent-text: #c9d8ff;
      --shadow: 0 14px 32px rgb(0 0 0 / 22%);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #0f1115;
        --panel: #171a21;
        --panel-strong: #20242d;
        --text: #eef2f7;
        --muted: #a7b0bf;
        --border: #303642;
        --high: #ff8a80;
        --medium: #ffbf66;
        --low: #70b8ff;
        --info: #c4cad4;
        --accent: #72a7ff;
        --accent-soft: #172033;
        --accent-border: #2f4975;
        --accent-text: #c9d8ff;
        --shadow: 0 14px 32px rgb(0 0 0 / 22%);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    .topbar {
      align-items: center;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      margin-bottom: 22px;
    }
    .brand {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .theme-toggle {
      appearance: none;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 12px;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
    }
    .theme-toggle:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .theme-toggle:focus-visible {
      outline: 3px solid var(--accent-border);
      outline-offset: 2px;
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0 56px;
    }
    .hero {
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
      margin: 0 0 8px;
      text-transform: uppercase;
    }
    h1 {
      font-size: 34px;
      line-height: 1.15;
      margin: 0 0 12px;
    }
    .subtitle {
      max-width: 800px;
      color: var(--muted);
      margin: 0;
      font-size: 16px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin: 24px 0;
    }
    .summary-card, .finding, .empty {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .summary-card {
      padding: 16px;
      min-height: 96px;
    }
    .summary-card span {
      color: var(--muted);
      display: block;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .summary-card strong {
      display: block;
      font-size: 18px;
      overflow-wrap: anywhere;
    }
    .note {
      background: var(--accent-soft);
      border: 1px solid var(--accent-border);
      border-radius: 8px;
      color: var(--accent-text);
      margin: 0 0 24px;
      padding: 14px 16px;
    }
    .findings {
      display: grid;
      gap: 16px;
    }
    .finding {
      border-left: 5px solid var(--info);
      padding: 18px;
    }
    .finding.severity-high { border-left-color: var(--high); }
    .finding.severity-medium { border-left-color: var(--medium); }
    .finding.severity-low { border-left-color: var(--low); }
    .finding-header {
      align-items: flex-start;
      display: flex;
      gap: 16px;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .rule-id {
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      font-weight: 700;
      margin: 0 0 4px;
    }
    h2 { font-size: 22px; margin: 28px 0 14px; }
    h3 { font-size: 18px; line-height: 1.3; margin: 0; }
    h4 { font-size: 13px; margin: 16px 0 4px; text-transform: uppercase; }
    p { margin: 0; }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .badge {
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      padding: 4px 9px;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .severity-high .badge.severity { border-color: #fecdca; color: var(--high); }
    .severity-medium .badge.severity { border-color: #fedf89; color: var(--medium); }
    .severity-low .badge.severity { border-color: #b2ddff; color: var(--low); }
    :root[data-theme="dark"] .severity-high .badge.severity { border-color: #6f2b2b; }
    :root[data-theme="dark"] .severity-medium .badge.severity { border-color: #694614; }
    :root[data-theme="dark"] .severity-low .badge.severity { border-color: #254c7a; }
    .meta {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin: 12px 0 4px;
    }
    .meta div {
      background: var(--panel-strong);
      border-radius: 6px;
      padding: 10px;
    }
    dt {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 3px;
      text-transform: uppercase;
    }
    dd {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .empty { color: var(--muted); padding: 18px; }
    footer {
      color: var(--muted);
      font-size: 12px;
      margin-top: 28px;
    }
    @media (max-width: 640px) {
      main { width: min(100% - 20px, 1120px); padding-top: 24px; }
      h1 { font-size: 28px; }
      .topbar { align-items: flex-start; }
      .finding-header { display: block; }
      .badges { justify-content: flex-start; margin-top: 12px; }
    }
    @media print {
      .theme-toggle { display: none; }
      body { background: #ffffff; color: #111827; }
      .summary-card, .finding, .empty { box-shadow: none; }
    }
  </style>
</head>
<body>
  <main>
    <div class="topbar">
      <div class="brand">chainlink-audit</div>
      <button class="theme-toggle" type="button" aria-label="Toggle dark mode">Theme: <span id="theme-label">System</span></button>
    </div>
    <header class="hero">
      <p class="eyebrow">Chainlink Audit Kit</p>
      <h1>Chainlink Integration Audit Report</h1>
      <p class="subtitle">Potential Chainlink integration risks detected by heuristic MVP rules. Findings require manual review and are not confirmed vulnerabilities.</p>
    </header>

    <section class="summary" aria-label="Scan summary">
      <div class="summary-card"><span>Target</span><strong>${escapeHtml(result.targetPath)}</strong></div>
      <div class="summary-card"><span>Solidity Files</span><strong>${result.scannedFiles}</strong></div>
      <div class="summary-card"><span>Products</span><strong>${escapeHtml(products)}</strong></div>
      <div class="summary-card"><span>Findings</span><strong>${result.findings.length}</strong></div>
      <div class="summary-card"><span>Minimum Severity</span><strong>${escapeHtml(result.config.minSeverity)}</strong></div>
      <div class="summary-card"><span>Excluded Paths</span><strong>${escapeHtml(excludedPaths)}</strong></div>
    </section>

    <p class="note">This report is designed for audit triage. Validate each lead against source code, deployment configuration, and protocol assumptions before disclosure or remediation.</p>

    <section>
      <h2>Findings</h2>
      <div class="findings">
${findings}
      </div>
    </section>

    <footer>Generated at ${escapeHtml(generatedAt)} by chainlink-audit.</footer>
  </main>
  <script>
    (function () {
      var button = document.querySelector(".theme-toggle");
      var label = document.getElementById("theme-label");
      function applyLabel() {
        var theme = document.documentElement.dataset.theme || "light";
        if (label) label.textContent = theme === "dark" ? "Dark" : "Light";
      }
      if (button) {
        button.addEventListener("click", function () {
          var nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
          document.documentElement.dataset.theme = nextTheme;
          localStorage.setItem("chainlink-audit-theme", nextTheme);
          applyLabel();
        });
      }
      applyLabel();
    })();
  </script>
</body>
</html>`;
}

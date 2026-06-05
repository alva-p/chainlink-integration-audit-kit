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
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f9fc;
      --panel: #ffffff;
      --text: #111827;
      --muted: #5b6472;
      --border: #d8dee9;
      --high: #b42318;
      --medium: #b54708;
      --low: #175cd3;
      --info: #475467;
      --accent: #0f5fff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
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
      box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
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
      background: #eef4ff;
      border: 1px solid #c7d7fe;
      border-radius: 8px;
      color: #253b74;
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
    .meta {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin: 12px 0 4px;
    }
    .meta div {
      background: #f8fafc;
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
      .finding-header { display: block; }
      .badges { justify-content: flex-start; margin-top: 12px; }
    }
  </style>
</head>
<body>
  <main>
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
</body>
</html>`;
}

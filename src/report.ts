import type { Finding, ScanResult, Severity } from "./scanner.js";

const severityLabels: Record<Severity, string> = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

const severities: Severity[] = ["high", "medium", "low"];

function location(finding: Finding): string {
  return finding.line === null
    ? finding.file
    : `${finding.file}:${finding.line}`;
}

export function formatTerminalReport(result: ScanResult): string {
  const lines = [
    "Prisma Guard Lite",
    "",
    `Scan mode: ${result.scanMode}`,
    `Files scanned: ${result.filesScanned} migration ${result.filesScanned === 1 ? "file" : "files"}`,
    `Summary: ${result.summary.high} high, ${result.summary.medium} medium, ${result.summary.low} low`,
  ];

  for (const severity of severities) {
    const findings = result.findings.filter((finding) => finding.severity === severity);
    lines.push("", `${severityLabels[severity]} (${findings.length})`);

    if (findings.length === 0) {
      lines.push("  No findings.");
      continue;
    }

    findings.forEach((finding, index) => {
      lines.push(
        `  ${index + 1}. ${finding.title}`,
        `     ${location(finding)}`,
        `     ${finding.explanation}`,
        `     Suggested fix: ${finding.suggestedFix}`,
      );
    });
  }

  return lines.join("\n");
}

export function formatMarkdownReport(result: ScanResult): string {
  const lines = [
    "# Prisma Guard Lite Report",
    "",
    "## Summary",
    "",
    `- **Scan mode:** ${result.scanMode}`,
    `- **Files scanned:** ${result.filesScanned} migration ${result.filesScanned === 1 ? "file" : "files"}`,
    "",
    "| Severity | Count |",
    "| --- | ---: |",
    `| High | ${result.summary.high} |`,
    `| Medium | ${result.summary.medium} |`,
    `| Low | ${result.summary.low} |`,
  ];

  for (const severity of severities) {
    const findings = result.findings.filter((finding) => finding.severity === severity);
    lines.push("", `## ${severityLabels[severity]} Findings`, "");

    if (findings.length === 0) {
      lines.push("No findings.");
      continue;
    }

    findings.forEach((finding, index) => {
      lines.push(
        `### ${index + 1}. ${finding.title}`,
        "",
        `- **Severity:** ${severityLabels[finding.severity]}`,
        `- **File:** \`${finding.file}\``,
        `- **Line:** ${finding.line ?? "Not available"}`,
        `- **Explanation:** ${finding.explanation}`,
        `- **Suggested fix:** ${finding.suggestedFix}`,
        "",
      );
    });
  }

  lines.push(
    "## Suggested Next Steps",
    "",
    "1. Review all high-severity findings before deployment.",
    "2. Test risky migrations against a recent production-like backup.",
    "3. Confirm backups and rollback procedures are ready.",
    "4. Review medium- and low-severity findings for relevance to your application.",
    "",
    "> Prisma Guard Lite is a heuristic pre-deploy scanner, not a guarantee of database safety.",
    "",
  );

  return lines.join("\n");
}

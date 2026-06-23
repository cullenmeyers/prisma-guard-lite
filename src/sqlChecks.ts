import type { Finding, Severity } from "./scanner.js";

interface SqlRule {
  severity: Severity;
  pattern: RegExp;
  title: string;
  explanation: string;
  suggestedFix: string;
}

const rules: SqlRule[] = [
  {
    severity: "high",
    pattern: /\bDROP\s+TABLE\b/gi,
    title: "Migration drops a table",
    explanation: "Dropping a table permanently removes its data and can break dependent queries.",
    suggestedFix: "Confirm the table is no longer needed, back up its data, and use a staged removal when possible.",
  },
  {
    severity: "high",
    pattern: /\bDROP\s+COLUMN\b/gi,
    title: "Migration drops a column",
    explanation: "Dropping a column permanently removes its stored data and may break older application versions.",
    suggestedFix: "Stop reading and writing the column first, deploy that change, then remove the column in a later migration.",
  },
  {
    severity: "high",
    pattern: /\bTRUNCATE(?:\s+TABLE)?\b/gi,
    title: "Migration truncates data",
    explanation: "TRUNCATE removes all rows from a table and is difficult to reverse.",
    suggestedFix: "Verify that full data deletion is intentional and ensure a tested backup or recovery plan exists.",
  },
  {
    severity: "medium",
    pattern: /\bCREATE\s+EXTENSION\b/gi,
    title: "Migration creates a database extension",
    explanation: "Database extensions may require elevated permissions or may not be available in every environment.",
    suggestedFix: "Confirm the extension is supported and provisioned in each target database environment.",
  },
  {
    severity: "medium",
    pattern: /\bDROP\s+EXTENSION\b/gi,
    title: "Migration drops a database extension",
    explanation: "Removing an extension can break database objects or application features that depend on it.",
    suggestedFix: "Identify dependent objects and features before removing the extension.",
  },
];

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function findingsForRule(sql: string, file: string, rule: SqlRule): Finding[] {
  const findings: Finding[] = [];
  rule.pattern.lastIndex = 0;

  for (const match of sql.matchAll(rule.pattern)) {
    findings.push({
      severity: rule.severity,
      file,
      line: lineNumberAt(sql, match.index ?? 0),
      title: rule.title,
      explanation: rule.explanation,
      suggestedFix: rule.suggestedFix,
    });
  }

  return findings;
}

function findDeletesWithoutWhere(sql: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const statementPattern = /\bDELETE\s+FROM\b[^;]*/gi;

  for (const match of sql.matchAll(statementPattern)) {
    const statement = match[0];
    if (!/\bWHERE\b/i.test(statement)) {
      findings.push({
        severity: "high",
        file,
        line: lineNumberAt(sql, match.index ?? 0),
        title: "DELETE FROM has no WHERE clause",
        explanation: "A DELETE statement without a WHERE clause removes every row from the target table.",
        suggestedFix: "Add a narrowly scoped WHERE clause, or explicitly verify and document that deleting all rows is intended.",
      });
    }
  }

  return findings;
}

function findColumnTypeChanges(sql: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const pattern =
    /\bALTER\s+TABLE\b[^;]*?\bALTER\s+COLUMN\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s+(?:(?:SET\s+DATA\s+)|(?:SET\s+))?TYPE\b/gi;

  for (const match of sql.matchAll(pattern)) {
    findings.push({
      severity: "high",
      file,
      line: lineNumberAt(sql, match.index ?? 0),
      title: "Migration changes a column type",
      explanation: "Changing a column type can rewrite or lock a table and may fail when existing values cannot be converted.",
      suggestedFix: "Test the conversion on production-like data and consider a staged add, backfill, and swap migration.",
    });
  }

  return findings;
}

export function checkSql(sql: string, file: string): Finding[] {
  return [
    ...rules.flatMap((rule) => findingsForRule(sql, file, rule)),
    ...findColumnTypeChanges(sql, file),
    ...findDeletesWithoutWhere(sql, file),
  ];
}

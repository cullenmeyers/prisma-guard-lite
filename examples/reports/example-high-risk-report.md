# Prisma Guard Lite Report

## Summary

- **Scan mode:** latest migration
- **Files scanned:** 1 migration file

| Severity | Count |
| --- | ---: |
| High | 2 |
| Medium | 1 |
| Low | 0 |

## HIGH Findings

### 1. Migration drops a column

- **Severity:** HIGH
- **File:** `prisma/migrations/20260623090000_remove_legacy/migration.sql`
- **Line:** 4
- **Explanation:** Dropping a column permanently removes its stored data and may break older application versions.
- **Suggested fix:** Stop reading and writing the column first, deploy that change, then remove the column in a later migration.

### 2. DELETE FROM has no WHERE clause

- **Severity:** HIGH
- **File:** `prisma/migrations/20260623090000_remove_legacy/migration.sql`
- **Line:** 8
- **Explanation:** A DELETE statement without a WHERE clause removes every row from the target table.
- **Suggested fix:** Add a narrowly scoped WHERE clause, or explicitly verify and document that deleting all rows is intended.

## MEDIUM Findings

### 1. Migration creates a database extension

- **Severity:** MEDIUM
- **File:** `prisma/migrations/20260623090000_remove_legacy/migration.sql`
- **Line:** 1
- **Explanation:** Database extensions may require elevated permissions or may not be available in every environment.
- **Suggested fix:** Confirm the extension is supported and provisioned in each target database environment.

## LOW Findings

No findings.

## Suggested Next Steps

1. Review all high-severity findings before deployment.
2. Test risky migrations against a recent production-like backup.
3. Confirm backups and rollback procedures are ready.

> Prisma Guard Lite is a heuristic scanner. It does not guarantee database safety.

# Prisma Guard Lite

Prisma Guard Lite is a pre-deploy migration risk checker for Prisma projects.

It scans Prisma migration SQL for destructive and deployment-sensitive
operations, then produces clear terminal, Markdown, or JSON results for local
review and CI.

## Why this exists

Prisma migrations can contain operations that deserve deliberate review before
deployment: dropped columns, dropped tables, unbounded deletes, truncation, and
column type conversions. These statements can be easy to miss inside generated
SQL.

Prisma Guard Lite makes those risks visible without connecting to your database.
It works locally, has no runtime dependencies, and can focus on migrations
introduced by a pull request or deployment.

## Quick start

Requires Node.js 18 or newer.

Scan the latest migration:

```bash
npx prisma-guard-lite --latest
```

Scan migrations changed since the main branch:

```bash
npx prisma-guard-lite --since main
```

Check staged migrations and fail when a high-severity risk is found:

```bash
npx prisma-guard-lite --staged --fail-on high
```

Pass a project directory to scan somewhere other than the current directory:

```bash
npx prisma-guard-lite /path/to/project --latest
```

Unless `--no-write` is provided, the command writes
`prisma-guard-report.md` in the scanned project root.

## What it checks

High severity:

- `DROP TABLE`
- `DROP COLUMN`
- `TRUNCATE`
- `DELETE FROM` without a `WHERE` clause
- risky `ALTER TABLE ... ALTER COLUMN ... TYPE` operations

Medium severity:

- `CREATE EXTENSION`
- `DROP EXTENSION`
- Prisma `Unsupported(...)`
- Prisma `dbgenerated(...)`
- soft deletion combined with `@unique`
- tenant-like fields without a matching `@@index`

Noisy best-practice checks are disabled by default. `--include-low` enables
checks for missing timestamp fields and simple tenant-ownership heuristics.

## Scan modes

Only one scan mode may be used at a time.

| Command | Migration files scanned |
| --- | --- |
| `npx prisma-guard-lite` | All migrations, labeled as a history scan |
| `npx prisma-guard-lite --latest` | The newest migration folder |
| `npx prisma-guard-lite --since main` | Migration files changed since the provided Git ref |
| `npx prisma-guard-lite --staged` | Staged migration files |
| `npx prisma-guard-lite --changed` | Changed and untracked migration files |

Git-aware modes require a Git worktree.

## Options

| Flag | Behavior |
| --- | --- |
| `--json` | Print structured JSON |
| `--include-low` | Include noisy low-severity best-practice checks |
| `--no-write` | Do not write `prisma-guard-report.md` |
| `--fail-on high` | Exit with code 1 when high findings exist |
| `--fail-on medium` | Exit with code 1 when high or medium findings exist |
| `--help`, `-h` | Print CLI usage and options |
| `--version`, `-v` | Print the installed package version |

## Example output

```text
Prisma Guard Lite

Scan mode: latest migration
Files scanned: 1 migration file
Summary: 5 high, 6 medium, 0 low

HIGH (5)
  1. Migration changes a column type
     prisma/migrations/20260101000000_init/migration.sql:3
     Changing a column type can rewrite or lock a table and may fail when existing values cannot be converted.
     Suggested fix: Test the conversion on production-like data and consider a staged add, backfill, and swap migration.
```

See the complete [high-risk report](examples/reports/example-high-risk-report.md)
and [clean report](examples/reports/example-clean-report.md).

## JSON output

```bash
npx prisma-guard-lite --latest --json --no-write
```

```json
{
  "scanMode": "latest migration",
  "filesScanned": 1,
  "summary": {
    "high": 1,
    "medium": 0,
    "low": 0
  },
  "findings": [
    {
      "severity": "high",
      "file": "prisma/migrations/20260623090000_remove_legacy/migration.sql",
      "line": 4,
      "title": "Migration drops a column",
      "explanation": "Dropping a column permanently removes its stored data and may break older application versions.",
      "suggestedFix": "Stop reading and writing the column first, deploy that change, then remove the column in a later migration."
    }
  ]
}
```

## GitHub Actions

This workflow checks migration files changed since `origin/main` and fails the
job when a high-severity finding exists:

```yaml
name: Prisma migration guard

on:
  pull_request:

jobs:
  prisma-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm install
      - run: npx prisma-guard-lite --since origin/main --fail-on high
```

A copy-ready version is available at
[examples/github-action.yml](examples/github-action.yml).

## Local development

```bash
npm install
npm run build
node dist/index.js example --latest
```

During development:

```bash
npm run dev -- example --latest
```

## Local verification

Run the release checks:

```bash
npm run build
node dist/index.js example --latest
node dist/index.js example --json
node dist/index.js example --latest --fail-on high
```

Expected results for the included example:

- the build exits `0`
- `--latest` exits `0` and reports 5 high, 6 medium, and 0 low findings
- `--json` exits `0` and returns `scanMode`, `filesScanned`, `summary`, and
  `findings`
- `--latest --fail-on high` prints the report and exits `1`

## Validation

The rules were tested against seven public Prisma projects containing 145
migrations. The validation led to focused Git-based scan modes and disabling
noisy schema conventions by default. See [VALIDATION.md](VALIDATION.md).

## Disclaimer

This is a heuristic scanner. It does not guarantee database safety.

Always review migrations, test against production-like data, maintain backups,
and prepare a rollback or recovery plan before deployment.

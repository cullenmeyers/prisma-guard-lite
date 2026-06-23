# Validation

Prisma Guard Lite was tested against seven public Prisma projects containing
145 committed migration files.

## What the first validation found

The original scanner reviewed every migration in repository history. It found
real destructive operations, but the whole-history approach produced too much
noise for pull-request and deployment review. Old, already-applied migrations
appeared beside newly introduced changes and could dominate the report.

## What changed in v2

The checker now supports focused migration scopes:

- `--latest` for the newest migration
- `--since <git-ref>` for branch and pull-request review
- `--staged` for pre-commit review
- `--changed` for local working-tree review

The default remains a clearly labeled history scan for broad audits.

## Most valuable findings

The rules that produced the clearest deployment signals were:

- `DROP COLUMN`
- `DROP TABLE`
- `TRUNCATE`
- `DELETE FROM` without `WHERE`
- risky `ALTER COLUMN TYPE` operations

The type-change matcher was also tightened after validation exposed false
positives involving a column literally named `type`.

## Noise reduction

The following best-practice checks are disabled by default:

- missing `createdAt`
- missing `updatedAt`
- missing `deletedAt`
- tenant ownership guessed from model names

They remain available through `--include-low`, but do not dilute the default
pre-deploy risk report.

## Current verdict

The useful core is a focused Prisma migration risk checker, not a general schema
style linter. Public validation should now concentrate on whether findings from
`--since`, `--staged`, and `--changed` are actionable in real pull requests.

# Prisma Guard Lite V2 Validation Rationale

The first validation pass tested seven public Prisma projects containing 145
migration files. It produced 235 findings: 138 high, 10 medium, and 87 low.

## Why whole-history scans are noisy

Migration directories are append-only history in many Prisma projects. A
correct warning about a `DROP COLUMN` from two years ago does not describe the
risk of today's deployment. One validated repository produced 119 high findings
across 95 historical migrations. The detections were mostly accurate, but the
volume made them poor pull-request or deployment signals.

The default mode remains a history scan for backward compatibility and broad
audits, but reports now label it explicitly. Focused modes select the latest,
Git-diffed, staged, or working-tree migration files.

## Why PR- and deploy-focused scanning is better

A reviewer needs to answer: “What risky database operations are introduced by
this change?” Scanning only relevant migration files:

- keeps old, already-applied migrations out of the alert count
- makes CI failure thresholds meaningful
- connects each finding to code currently under review
- makes destructive SQL harder to overlook

The recommended modes are `--since <git-ref>` for branch or PR review,
`--staged` before committing, `--changed` during local development, and
`--latest` for a simple pre-deploy check.

## Rules removed from default output

The following low-severity checks are now disabled unless `--include-low` is
provided:

- missing `createdAt`
- missing `updatedAt`
- missing `deletedAt`
- tenant ownership guessed from model names

Timestamp checks accounted for almost all low findings in validation and often
failed on snake_case or domain-specific timestamp names. Model names such as
`Product` and `Document` did not reliably imply tenant ownership.

The medium tenant-index rule remains enabled because it starts from an actual
tenant-like field rather than guessing from a model name.

## Rule precision adjustment

The risky column type rule remains high severity, but its matching is narrower.
It now requires an `ALTER COLUMN` identifier followed by `TYPE` or
`SET DATA TYPE`. This avoids treating a column literally named `type` followed
by `SET DEFAULT` as a type conversion.

## Next validation

Run the focused modes in real pull requests and compare findings only against
the migration files introduced by each change. The key measure is whether high
findings are actionable enough to use with `--fail-on high` in CI.

# prisma-guard-lite Real-World Validation

Validation date: June 23, 2026

This validation used the existing CLI without adding or changing any checks. Seven
public repositories were shallow-cloned into `validation-repos/`, scanned from
their repository roots, and reviewed manually.

All selected repositories had the exact paths expected by the MVP:

- `prisma/schema.prisma`
- one or more `prisma/migrations/**/migration.sql` files

The sample contains 145 migration files and produced 235 findings:

| Severity | Count |
| --- | ---: |
| High | 138 |
| Medium | 10 |
| Low | 87 |

An important qualification: almost all of these migrations are committed
historical migrations, not necessarily pending migrations. A destructive
statement can be correctly detected while still being irrelevant to the next
deployment.

## 1. reductoai/remembrall

- **Repository:** [reductoai/remembrall](https://github.com/reductoai/remembrall)
- **Validated commit:** `b9537f7`
- **Had `schema.prisma`:** Yes
- **Had migrations:** Yes, 4 migration files
- **Command run:** `node dist/index.js validation-repos/remembrall --json`
- **Summary:** 0 high, 9 medium, 15 low

### Top 5 findings

1. Medium — `prisma/migrations/0_init/migration.sql:11` — Migration creates a database extension
2. Medium — `prisma/schema.prisma:12` — Schema uses `dbgenerated(...)`
3. Medium — `prisma/schema.prisma:25` — Schema uses `dbgenerated(...)`
4. Medium — `prisma/schema.prisma:29` — Schema uses `Unsupported(...)`
5. Medium — `prisma/schema.prisma:44` — Schema uses `dbgenerated(...)`

### Review

**Actually useful:** The `CREATE EXTENSION` finding is useful because the project
uses PostgreSQL-specific functionality and deployment permissions can differ by
environment. The two `Unsupported("vector")` findings are useful as a reminder
that vector columns require provider-specific handling.

**Noisy or false-positive:** Six separate `dbgenerated(...)` findings mostly
repeat the same architectural fact: this project intentionally uses
database-generated identifiers. The 15 timestamp findings are mostly style
advice, especially for Auth.js records and models that already have one relevant
timestamp. “Document may be missing tenant ownership” is not supported by the
application context and is likely noise.

**Rule improvement:** Group repeated `dbgenerated(...)` and `Unsupported(...)`
findings or lower them to informational severity. Remove or greatly weaken the
model-name tenant heuristic. Timestamp checks should recognize that not every
model needs both audit fields.

## 2. fnordcredit/fnordcredit

- **Repository:** [fnordcredit/fnordcredit](https://github.com/fnordcredit/fnordcredit)
- **Validated commit:** `fa883cf`
- **Had `schema.prisma`:** Yes
- **Had migrations:** Yes, 2 migration files
- **Command run:** `node dist/index.js validation-repos/fnordcredit --json`
- **Summary:** 0 high, 0 medium, 8 low

### Top 5 findings

1. Low — `prisma/schema.prisma:26` — AuthMethod is missing `createdAt`
2. Low — `prisma/schema.prisma:26` — AuthMethod is missing `updatedAt`
3. Low — `prisma/schema.prisma:37` — ProductCategory is missing `createdAt`
4. Low — `prisma/schema.prisma:37` — ProductCategory is missing `updatedAt`
5. Low — `prisma/schema.prisma:44` — Product is missing `createdAt`

### Review

**Actually useful:** No finding identifies a clear deployment or data-safety
risk. A team might choose to add timestamps for auditability, but that is a
schema convention rather than a pre-deploy safety issue.

**Noisy or false-positive:** “Product may be missing tenant ownership” is a
likely false-positive because this application appears to have a shared product
catalog. Missing timestamps on authentication methods and categories are
reasonable design choices.

**Rule improvement:** Remove the tenant-owned model-name check from default
output. Make timestamp checks opt-in, informational, or limited to models that
already demonstrate an audit-field convention.

## 3. slax-lab/slax-reader-api

- **Repository:** [slax-lab/slax-reader-api](https://github.com/slax-lab/slax-reader-api)
- **Validated commit:** `7b5003b`
- **Had `schema.prisma`:** Yes
- **Had migrations:** Yes, 12 migration files
- **Command run:** `node dist/index.js validation-repos/slax-reader-api --json`
- **Summary:** 5 high, 0 medium, 38 low

### Top 5 findings

1. High — `prisma/migrations/20250911020048_mark_comment_rename/migration.sql:40` — Migration drops a table
2. High — `prisma/migrations/20250911054922_change_for_powersync/migration.sql:62` — Migration drops a table
3. High — `prisma/migrations/20250911054922_change_for_powersync/migration.sql:65` — Migration drops a table
4. High — `prisma/migrations/20250911054922_change_for_powersync/migration.sql:68` — Migration drops a table
5. High — `prisma/migrations/20260608030507_bookmark_share_index_sharecode/migration.sql:14` — Migration drops a column

### Review

**Actually useful:** All five high findings point to real destructive SQL. The
three tables dropped together during a synchronization refactor deserve review,
as does the removed bookmark-share identifier. These are exactly the kinds of
statements a pre-deploy reviewer should notice.

**Noisy or false-positive:** All 38 low findings are misleading. This schema
uses snake_case fields such as `created_at` and `updated_at`; the rules only
recognize camelCase `createdAt` and `updatedAt`. Many models already have the
timestamps the tool claims are missing.

**Rule improvement:** Timestamp checks must recognize mapped or conventional
snake_case names before they can be trusted. More importantly, the CLI should
distinguish pending or newly changed migrations from old migration history.

## 4. Telecom-Etude/jet-centre

- **Repository:** [Telecom-Etude/jet-centre](https://github.com/Telecom-Etude/jet-centre)
- **Validated commit:** `86bd2d5`
- **Had `schema.prisma`:** Yes
- **Had migrations:** Yes, 95 migration files
- **Command run:** `node dist/index.js validation-repos/jet-centre --json`
- **Summary:** 119 high, 0 medium, 0 low

### Top 5 findings

1. High — `prisma/migrations/20241009212339_remove_some_useless_fields_of_study/migration.sql:8` — Migration drops a column
2. High — `prisma/migrations/20241020143537_assigne_un_unique_domain_par_etude/migration.sql:15` — Migration drops a column
3. High — `prisma/migrations/20241020143537_assigne_un_unique_domain_par_etude/migration.sql:18` — Migration drops a column
4. High — `prisma/migrations/20241020170629_rename_adress_address/migration.sql:11` — Migration drops a column
5. High — `prisma/migrations/20241020170629_rename_adress_address/migration.sql:15` — Migration drops a column

### Review

**Actually useful:** The SQL detections are technically accurate. Several
migrations implement renames as `DROP COLUMN` plus `ADD COLUMN`, which can lose
data if deployed without a copy/backfill. Nine enum type conversions are also
worth reviewing for incompatible existing values.

**Noisy or false-positive:** Reporting 119 high findings from 95 historical
migrations is not operationally useful before a new deployment. The severe
volume makes it difficult to identify what is newly introduced.

The zero schema findings do not mean the schema is clean. This repository uses a
split Prisma schema: `prisma/schema.prisma` contains generators and the
datasource, while models live in `prisma/models/*.prisma`. The current scanner
does not read those model files.

**Rule improvement:** Limit deploy-focused results to changed or pending
migrations. Treat split-schema support as a coverage requirement if Prisma Guard
continues; otherwise clearly report that model checks were not run. This is a
coverage issue rather than a reason to add more risk rules.

## 5. withmoney/withmoney-api

- **Repository:** [withmoney/withmoney-api](https://github.com/withmoney/withmoney-api)
- **Validated commit:** `7394977`
- **Had `schema.prisma`:** Yes
- **Had migrations:** Yes, 6 migration files
- **Command run:** `node dist/index.js validation-repos/withmoney-api --json`
- **Summary:** 6 high, 1 medium, 0 low

### Top 5 findings

1. High — `prisma/migrations/20250121155944_/migration.sql:11` — Migration changes a column type
2. High — `prisma/migrations/20250121155944_/migration.sql:12` — Migration changes a column type
3. High — `prisma/migrations/20250121155944_/migration.sql:19` — Migration drops a column
4. High — `prisma/migrations/20250121155944_/migration.sql:19` — Migration changes a column type
5. High — `prisma/migrations/20250121161109_/migration.sql:8` — Migration drops a column

### Review

**Actually useful:** The two enum conversions at lines 11 and 12 are genuine
type changes. The two dropped `operation_type` columns are genuine destructive
changes. The soft-delete plus unique fields warning is useful: deleted users can
continue to reserve email and verification-token values.

**Noisy or false-positive:** Two of the four reported type changes are false
positives. At lines 19 and 8, the statements drop `operation_type` and then alter
a column named `"type"` to set a default. The regex mistakes the quoted column
name `type` for the SQL `TYPE` keyword.

**Rule improvement:** The type-change rule needs statement-aware matching that
requires `ALTER COLUMN <identifier> TYPE` or `SET DATA TYPE`, rather than any
later occurrence of the word `type`.

## 6. hackclub/questbook

- **Repository:** [hackclub/questbook](https://github.com/hackclub/questbook)
- **Validated commit:** `319a354`
- **Had `schema.prisma`:** Yes
- **Had migrations:** Yes, 15 migration files
- **Command run:** `node dist/index.js validation-repos/questbook --json`
- **Summary:** 4 high, 0 medium, 4 low

### Top 5 findings

1. High — `prisma/migrations/20241228221644_remove_step_complette/migration.sql:9` — Migration drops a column
2. High — `prisma/migrations/20250128020108_/migration.sql:11` — Migration changes a column type
3. High — `prisma/migrations/20250128020304_/migration.sql:11` — Migration changes a column type
4. High — `prisma/migrations/20250131022923_/migration.sql:8` — Migration drops a column
5. Low — `prisma/schema.prisma:16` — User is missing `createdAt`

### Review

**Actually useful:** Both column drops combine removal with adding replacement
fields, so they could lose existing data without a backfill. The enum type
changes are real and could fail if old enum values are incompatible.

**Noisy or false-positive:** The timestamp findings are not deployment risks.
The `Quests` model already has domain-specific lifecycle fields such as
`lastUpdated` and `dateCompleted`, making generic `createdAt`/`updatedAt`
warnings especially weak.

**Rule improvement:** Recognize semantically equivalent timestamp fields or
remove timestamp checks from the default risk report.

## 7. LanaKee/chunilink

- **Repository:** [LanaKee/chunilink](https://github.com/LanaKee/chunilink)
- **Validated commit:** `73c79c3`
- **Had `schema.prisma`:** Yes
- **Had migrations:** Yes, 11 migration files
- **Command run:** `node dist/index.js validation-repos/chunilink --json`
- **Summary:** 4 high, 0 medium, 22 low

### Top 5 findings

1. High — `prisma/migrations/20250506043529_/migration.sql:10` — Migration changes a column type
2. High — `prisma/migrations/20250506044731_/migration.sql:2` — Migration changes a column type
3. High — `prisma/migrations/20250506055444_/migration.sql:12` — Migration drops a table
4. High — `prisma/migrations/20250506061131_/migration.sql:11` — Migration drops a column
5. Low — `prisma/schema.prisma:25` — Account is missing `createdAt`

### Review

**Actually useful:** All four high findings are accurate: an enum conversion, a
text type conversion, a dropped rank table, and a dropped player relationship
column. Each deserves review when pending.

**Noisy or false-positive:** The 22 timestamp findings dominate the output even
though many affected models are authentication tables, reference data, or join
tables. `Player` already has `lastUpdated`, which the exact-name rule ignores.

**Rule improvement:** Remove generic timestamp enforcement from default scans,
or make it convention-aware and configurable.

## Cross-Repository Observations

### Findings that held up well

1. **`DROP COLUMN`** found real data-loss boundaries, especially migrations that
   looked like renames but were implemented as drop-and-add operations.
2. **`DROP TABLE`** accurately highlighted destructive refactors and removed
   synchronization tables.
3. **Column type changes** found genuine enum and scalar conversions that can
   fail or rewrite data, although the current regex produced two false
   positives.
4. **Soft deletion plus `@unique`** appeared once and identified a plausible
   product behavior issue: deleted accounts can reserve unique values.
5. **`CREATE EXTENSION`** appeared once and was a useful portability and
   permissions warning.

### Findings that did not hold up well

1. **Missing `createdAt` / `updatedAt`** produced 85 of the 87 low findings.
   They were frequently style preferences, failed to recognize snake_case or
   domain-specific equivalents, and overwhelmed stronger findings.
2. **Tenant ownership inferred from model names** produced two findings and
   both appeared unsupported by context. `Product` and `Document` are too
   generic to imply multi-tenancy.
3. **`dbgenerated(...)`** generated six repeated warnings in one repository for
   an intentional ID strategy. The fact can matter, but medium severity per
   occurrence is too strong.
4. **`Unsupported(...)`** was relevant to provider-specific vector columns, but
   repeated per-field warnings added little after the first.

### Scanner limitations exposed by validation

- Scanning all migration history makes technically correct findings look like
  current deployment blockers.
- Split Prisma schemas are used in a real project, but only
  `prisma/schema.prisma` is scanned.
- Exact camelCase timestamp names create obvious false positives.
- The type-change regex can mistake a column named `type` for the SQL keyword.
- No sampled project triggered `DELETE FROM` without `WHERE`, `TRUNCATE`,
  `DROP EXTENSION`, or a missing tenant-field index, so this validation does not
  establish their real-world precision.

## Validation Verdict

### Did the tool find real useful risks?

Yes. It reliably surfaced real `DROP COLUMN`, `DROP TABLE`, and genuine column
type changes. Several findings identified migrations that could discard data
during a rename or fail while converting enum values. The extension and
soft-delete uniqueness warnings also demonstrated value in isolated cases.

### Were most findings obvious or noisy?

The SQL findings were usually syntactically correct, but many were
operationally noisy because they came from old migration history. The schema
findings were substantially noisier: timestamp conventions accounted for 85
findings and often misread valid naming or domain choices.

### Which 2–3 rules are most valuable?

1. `DROP COLUMN`
2. `DROP TABLE`
3. `ALTER TABLE ... ALTER COLUMN ... TYPE` / `SET DATA TYPE`, after fixing its
   precision

These rules are closest to the core promise of preventing risky deployment
migrations.

### Which rules should be removed or weakened?

- Remove or make opt-in the missing `createdAt` and `updatedAt` checks.
- Remove the tenant-owned model-name heuristic from default output.
- Weaken and consolidate `dbgenerated(...)` and `Unsupported(...)` findings.
- Keep the type-change rule, but fix its false-positive behavior before relying
  on it.

### Continue as Prisma Guard, or pivot?

Continue, but narrow the product rather than broadening it.

The useful product is a focused Prisma migration guard that reviews migrations
introduced by the current change or pending deployment. The validation does not
support a broad Prisma schema quality linter: those rules created most of the
noise and diluted the credible data-safety findings.

The current MVP proves there is a useful core, but whole-history scanning and
opinionated timestamp linting prevent it from being a trustworthy deployment
signal today. The next decision should be to sharpen migration scope and
precision, not add more checks or pivot to a SaaS product.

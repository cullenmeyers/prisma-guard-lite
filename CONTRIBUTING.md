# Contributing

Thanks for helping improve Prisma Guard Lite.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run build
node dist/index.js example --latest
```

For development without rebuilding first:

```bash
npm run dev -- example --latest
```

## Add or change a check

- SQL migration checks live in `src/sqlChecks.ts`.
- Prisma schema checks live in `src/schemaParser.ts`.
- Keep checks small, explainable, and tied to a concrete deployment risk.
- Include the file and line number whenever possible.
- Validate changes against the example project and representative real Prisma
  migrations.
- Avoid adding opinionated schema conventions to default output without
  evidence that they identify meaningful risk.

Run `npm run build` before opening a pull request.

## Report false positives

Open an issue with:

- the Prisma Guard Lite version
- the command and scan mode used
- the relevant migration or schema excerpt
- the finding that was incorrect
- why the operation is safe or was misidentified

Remove secrets and private application data before sharing examples.

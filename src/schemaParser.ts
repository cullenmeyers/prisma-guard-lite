import type { Finding } from "./scanner.js";

const tenantFields = [
  "tenantId",
  "orgId",
  "organizationId",
  "workspaceId",
  "teamId",
];

const tenantOwnedModelNames = new Set([
  "project",
  "task",
  "customer",
  "invoice",
  "order",
  "subscription",
  "member",
  "file",
  "document",
  "message",
  "ticket",
  "product",
]);

interface Field {
  name: string;
  line: number;
  source: string;
}

interface ModelBlock {
  name: string;
  line: number;
  fields: Field[];
  indexes: string[];
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function parseModels(schema: string): ModelBlock[] {
  const models: ModelBlock[] = [];
  const modelPattern = /\bmodel\s+(\w+)\s*\{([\s\S]*?)\}/g;

  for (const match of schema.matchAll(modelPattern)) {
    const name = match[1];
    const body = match[2];
    const modelStart = match.index ?? 0;
    const bodyStart = modelStart + match[0].indexOf(body);
    const fields: Field[] = [];
    const indexes: string[] = [];

    body.split("\n").forEach((rawLine, offset) => {
      const source = rawLine.trim();
      const line = lineNumberAt(schema, bodyStart) + offset;

      if (!source || source.startsWith("//")) {
        return;
      }

      if (source.startsWith("@@index")) {
        indexes.push(source);
        return;
      }

      if (source.startsWith("@@") || source.startsWith("///")) {
        return;
      }

      const fieldMatch = source.match(/^(\w+)\s+\S+/);
      if (fieldMatch) {
        fields.push({ name: fieldMatch[1], line, source });
      }
    });

    models.push({
      name,
      line: lineNumberAt(schema, modelStart),
      fields,
      indexes,
    });
  }

  return models;
}

function findSchemaPattern(
  schema: string,
  file: string,
  pattern: RegExp,
  title: string,
  explanation: string,
  suggestedFix: string,
): Finding[] {
  const findings: Finding[] = [];

  for (const match of schema.matchAll(pattern)) {
    findings.push({
      severity: "medium",
      file,
      line: lineNumberAt(schema, match.index ?? 0),
      title,
      explanation,
      suggestedFix,
    });
  }

  return findings;
}

export function checkSchema(
  schema: string,
  file: string,
  includeLow: boolean,
): Finding[] {
  const findings: Finding[] = [
    ...findSchemaPattern(
      schema,
      file,
      /\bUnsupported\s*\(/g,
      "Schema uses Unsupported(...)",
      "Unsupported field types are not fully represented by Prisma Client and may need manual handling.",
      "Confirm the field is intentional and document how application code and migrations handle it.",
    ),
    ...findSchemaPattern(
      schema,
      file,
      /\bdbgenerated\s*\(/g,
      "Schema uses dbgenerated(...)",
      "Database-generated defaults can behave differently across providers and may hide database-specific behavior.",
      "Verify the expression in every target database and cover it with migration and application tests.",
    ),
  ];

  for (const model of parseModels(schema)) {
    const fieldNames = new Set(model.fields.map((field) => field.name));
    const deletedAt = model.fields.find((field) => field.name === "deletedAt");
    const uniqueFields = model.fields.filter((field) => /(?:^|\s)@unique(?:\s|$|\()/i.test(field.source));

    if (deletedAt && uniqueFields.length > 0) {
      findings.push({
        severity: "medium",
        file,
        line: uniqueFields[0].line,
        title: `${model.name} combines soft deletion with unique fields`,
        explanation: `The model has deletedAt and unique field(s): ${uniqueFields.map((field) => field.name).join(", ")}. Soft-deleted rows can continue to block reuse of those values.`,
        suggestedFix: "Review whether uniqueness should include deletion state or be enforced with a database-specific partial unique index.",
      });
    }

    for (const tenantField of tenantFields.filter((field) => fieldNames.has(field))) {
      const indexed = model.indexes.some((index) => {
        const indexedFields = index.match(/@@index\s*\(\s*\[([^\]]+)\]/)?.[1] ?? "";
        return indexedFields
          .split(",")
          .map((field) => field.trim().split(/\s+/)[0])
          .includes(tenantField);
      });

      if (!indexed) {
        const field = model.fields.find((candidate) => candidate.name === tenantField);
        findings.push({
          severity: "medium",
          file,
          line: field?.line ?? model.line,
          title: `${model.name}.${tenantField} has no matching index`,
          explanation: "Tenant-scoped queries commonly filter by this field and may slow down as the table grows.",
          suggestedFix: `Add @@index([${tenantField}]) or a compound index beginning with ${tenantField} that matches common queries.`,
        });
      }
    }

    if (includeLow && !fieldNames.has("createdAt")) {
      findings.push({
        severity: "low",
        file,
        line: model.line,
        title: `${model.name} is missing createdAt`,
        explanation: "Creation timestamps are useful for auditing, debugging, and ordering records.",
        suggestedFix: "Consider adding createdAt DateTime @default(now()).",
      });
    }

    if (includeLow && !fieldNames.has("updatedAt")) {
      findings.push({
        severity: "low",
        file,
        line: model.line,
        title: `${model.name} is missing updatedAt`,
        explanation: "Update timestamps are useful for auditing changes and cache synchronization.",
        suggestedFix: "Consider adding updatedAt DateTime @updatedAt.",
      });
    }

    if (includeLow && !fieldNames.has("deletedAt")) {
      findings.push({
        severity: "low",
        file,
        line: model.line,
        title: `${model.name} is missing deletedAt`,
        explanation: "A soft-delete timestamp can help preserve records that should not be removed immediately.",
        suggestedFix: "If this model needs soft deletion, consider adding deletedAt DateTime?.",
      });
    }

    const hasTenantField = tenantFields.some((field) => fieldNames.has(field));
    if (
      includeLow &&
      tenantOwnedModelNames.has(model.name.toLowerCase()) &&
      !hasTenantField
    ) {
      findings.push({
        severity: "low",
        file,
        line: model.line,
        title: `${model.name} may be missing tenant ownership`,
        explanation: "The model name suggests tenant-owned business data, but no common tenant field was found.",
        suggestedFix: "If this data is tenant-owned, add an appropriate tenant identifier and index it. Otherwise, document that the model is global.",
      });
    }
  }

  return findings;
}

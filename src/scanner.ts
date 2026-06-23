import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { checkSchema } from "./schemaParser.js";
import { checkSql } from "./sqlChecks.js";

export type Severity = "high" | "medium" | "low";
export type ScanMode = "history" | "latest" | "since" | "staged" | "changed";

export interface ScanOptions {
  mode: ScanMode;
  sinceRef?: string;
  includeLow: boolean;
}

export interface Finding {
  severity: Severity;
  file: string;
  line: number | null;
  title: string;
  explanation: string;
  suggestedFix: string;
}

export interface ScanResult {
  scanMode: string;
  filesScanned: number;
  summary: Record<Severity, number>;
  findings: Finding[];
}

const execFileAsync = promisify(execFile);

const severityOrder: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

async function findMigrationFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          return findMigrationFiles(fullPath);
        }

        return entry.isFile() && entry.name === "migration.sql"
          ? [fullPath]
          : [];
      }),
    );

    return files.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function findLatestMigrationFile(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const folder of folders) {
      const migrationPath = path.join(directory, folder, "migration.sql");
      const stat = await fs.stat(migrationPath).catch(() => null);
      if (stat?.isFile()) {
        return [migrationPath];
      }
    }

    return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function relativeFile(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function gitLines(projectRoot: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", projectRoot, ...args], {
      encoding: "utf8",
    });
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || "This scan mode requires a Git worktree.");
  }
}

async function existingMigrationPaths(
  projectRoot: string,
  relativePaths: string[],
): Promise<string[]> {
  const uniquePaths = [...new Set(relativePaths)];
  const results = await Promise.all(
    uniquePaths.map(async (relativePath) => {
      const normalized = relativePath.split(path.sep).join("/");
      if (!/^prisma\/migrations\/.+\/migration\.sql$/.test(normalized)) {
        return null;
      }

      const fullPath = path.join(projectRoot, relativePath);
      const stat = await fs.stat(fullPath).catch(() => null);
      return stat?.isFile() ? fullPath : null;
    }),
  );

  return results.filter((filePath): filePath is string => filePath !== null).sort();
}

async function selectMigrationFiles(
  projectRoot: string,
  options: ScanOptions,
): Promise<string[]> {
  const migrationRoot = path.join(projectRoot, "prisma", "migrations");

  if (options.mode === "history") {
    return (await findMigrationFiles(migrationRoot)).sort();
  }

  if (options.mode === "latest") {
    return findLatestMigrationFile(migrationRoot);
  }

  const pathspec = "prisma/migrations/**/migration.sql";

  if (options.mode === "since") {
    if (!options.sinceRef) {
      throw new Error("--since requires a Git ref.");
    }
    const files = await gitLines(projectRoot, [
      "diff",
      "--relative",
      "--name-only",
      "--diff-filter=ACMR",
      options.sinceRef,
      "--",
      pathspec,
    ]);
    return existingMigrationPaths(projectRoot, files);
  }

  if (options.mode === "staged") {
    const files = await gitLines(projectRoot, [
      "diff",
      "--relative",
      "--cached",
      "--name-only",
      "--diff-filter=ACMR",
      "--",
      pathspec,
    ]);
    return existingMigrationPaths(projectRoot, files);
  }

  const tracked = await gitLines(projectRoot, [
    "diff",
    "--relative",
    "--name-only",
    "--diff-filter=ACMR",
    "HEAD",
    "--",
    pathspec,
  ]);
  const untracked = await gitLines(projectRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    pathspec,
  ]);
  return existingMigrationPaths(projectRoot, [...tracked, ...untracked]);
}

function scanModeLabel(options: ScanOptions): string {
  switch (options.mode) {
    case "latest":
      return "latest migration";
    case "since":
      return `migrations changed since ${options.sinceRef}`;
    case "staged":
      return "staged migrations";
    case "changed":
      return "changed migrations";
    default:
      return "history scan";
  }
}

export async function scanProject(
  projectRoot: string,
  options: ScanOptions,
): Promise<ScanResult> {
  const findings: Finding[] = [];
  const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");

  try {
    const schema = await fs.readFile(schemaPath, "utf8");
    findings.push(
      ...checkSchema(
        schema,
        relativeFile(projectRoot, schemaPath),
        options.includeLow,
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const migrationFiles = await selectMigrationFiles(projectRoot, options);

  for (const migrationPath of migrationFiles) {
    const sql = await fs.readFile(migrationPath, "utf8");
    findings.push(...checkSql(sql, relativeFile(projectRoot, migrationPath)));
  }

  findings.sort((a, b) => {
    return (
      severityOrder[a.severity] - severityOrder[b.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER)
    );
  });

  const summary: Record<Severity, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const finding of findings) {
    summary[finding.severity] += 1;
  }

  return {
    scanMode: scanModeLabel(options),
    filesScanned: migrationFiles.length,
    summary,
    findings,
  };
}

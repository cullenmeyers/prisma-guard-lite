#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { formatMarkdownReport, formatTerminalReport } from "./report.js";
import { scanProject, type ScanMode, type Severity } from "./scanner.js";

interface CliOptions {
  projectRoot: string;
  json: boolean;
  mode: ScanMode;
  sinceRef?: string;
  includeLow: boolean;
  writeReport: boolean;
  failOn?: Extract<Severity, "high" | "medium">;
}

function parseArgs(args: string[]): CliOptions {
  let projectPath: string | undefined;
  let json = false;
  let mode: ScanMode = "history";
  let sinceRef: string | undefined;
  let includeLow = false;
  let writeReport = true;
  let failOn: Extract<Severity, "high" | "medium"> | undefined;
  let selectedMode: string | undefined;

  const selectMode = (nextMode: ScanMode, flag: string): void => {
    if (selectedMode) {
      throw new Error(`${flag} cannot be combined with ${selectedMode}.`);
    }
    mode = nextMode;
    selectedMode = flag;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--latest") {
      selectMode("latest", arg);
    } else if (arg === "--staged") {
      selectMode("staged", arg);
    } else if (arg === "--changed") {
      selectMode("changed", arg);
    } else if (arg === "--since") {
      selectMode("since", arg);
      sinceRef = args[index + 1];
      if (!sinceRef || sinceRef.startsWith("-")) {
        throw new Error("--since requires a Git ref.");
      }
      index += 1;
    } else if (arg === "--include-low") {
      includeLow = true;
    } else if (arg === "--no-write") {
      writeReport = false;
    } else if (arg === "--fail-on") {
      const threshold = args[index + 1];
      if (threshold !== "high" && threshold !== "medium") {
        throw new Error("--fail-on must be either high or medium.");
      }
      failOn = threshold;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (projectPath) {
      throw new Error("Only one project path may be provided.");
    } else {
      projectPath = arg;
    }
  }

  return {
    projectRoot: path.resolve(projectPath ?? process.cwd()),
    json,
    mode,
    sinceRef,
    includeLow,
    writeReport,
    failOn,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const stat = await fs.stat(options.projectRoot).catch(() => null);

  if (!stat?.isDirectory()) {
    throw new Error(`Project directory not found: ${options.projectRoot}`);
  }

  const result = await scanProject(options.projectRoot, {
    mode: options.mode,
    sinceRef: options.sinceRef,
    includeLow: options.includeLow,
  });
  const reportPath = path.join(options.projectRoot, "prisma-guard-report.md");
  if (options.writeReport) {
    await fs.writeFile(reportPath, formatMarkdownReport(result), "utf8");
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const reportStatus = options.writeReport
      ? `Markdown report: ${reportPath}`
      : "Markdown report: not written (--no-write)";
    process.stdout.write(`${formatTerminalReport(result)}\n\n${reportStatus}\n`);
  }

  const shouldFail =
    options.failOn === "high"
      ? result.summary.high > 0
      : options.failOn === "medium"
        ? result.summary.high > 0 || result.summary.medium > 0
        : false;

  if (shouldFail) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`prisma-guard-lite: ${message}\n`);
  process.exitCode = 1;
});

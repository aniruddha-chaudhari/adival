#!/usr/bin/env bun
/**
 * watch-memory.ts — Auto-index QMD memory on file changes
 *
 * Usage: bun run watch-memory.ts
 *
 * Watches memory/memory/ for .md file changes (add/modify/delete)
 * and runs `qmd update` to keep the search index current.
 */

import chokidar from "chokidar";
import { spawn } from "child_process";
import { join } from "path";

const memoryDir = join(process.cwd(), "memory", "memory");
const watcher = chokidar.watch(`${memoryDir}/**/*.md`, {
  persistent: true,
  ignoreInitial: true, // Don't trigger on existing files
});

console.log(`Watching ${memoryDir} for .md file changes...`);
console.log("Press Ctrl+C to stop.");

watcher.on("add", path => {
  console.log(`New file: ${path}`);
  runQmdUpdate();
});

watcher.on("change", path => {
  console.log(`Changed: ${path}`);
  runQmdUpdate();
});

watcher.on("unlink", path => {
  console.log(`Deleted: ${path}`);
  runQmdUpdate();
});

function runQmdUpdate() {
  const proc = spawn("qmd", ["update"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  proc.on("close", code => {
    if (code === 0) {
      console.log("QMD index updated.");
    } else {
      console.error(`QMD update failed with code ${code}`);
    }
  });

  proc.on("error", err => {
    console.error(`Failed to run qmd update: ${err.message}`);
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nStopping watcher...");
  watcher.close();
  process.exit(0);
});

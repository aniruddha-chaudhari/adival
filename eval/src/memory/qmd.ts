import { execSync, spawnSync } from "child_process";
import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync } from "fs";

/** Result shape returned by QMD search commands (--json flag) */
export interface QmdResult {
    docid: string;
    path: string;
    score: number;
    title?: string;
    snippet?: string;
    content?: string;
}

export interface QmdStatusResult {
    collections: number;
    documents: number;
    vectors: number;
    mcp: string;
}

/**
 * Resolves the Node.js command array to invoke QMD.
 * On Windows, the `qmd` bash shim does not work natively — we fall back to
 * running the compiled JS entry point directly with Node.
 */
function resolveQmdCmd(): string[] {
    // 1. Try the system PATH first (works on macOS/Linux)
    try {
        execSync("qmd --version", { stdio: "ignore" });
        return ["qmd"];
    } catch {
        // fall through
    }

    // 2. Bun global node_modules (Windows default location)
    const bunGlobal = join(homedir(), "node_modules", "@tobilu", "qmd", "dist", "qmd.js");
    if (existsSync(bunGlobal)) {
        return ["node", bunGlobal];
    }

    // 3. npm global node_modules
    const npmGlobal = join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@tobilu", "qmd", "dist", "qmd.js");
    if (existsSync(npmGlobal)) {
        return ["node", npmGlobal];
    }

    throw new Error(
        "QMD not found. Install with: bun install -g @tobilu/qmd  or  npm install -g @tobilu/qmd"
    );
}

/** Cached resolved command */
let _qmdCmd: string[] | null = null;
function getQmdCmd(): string[] {
    if (!_qmdCmd) _qmdCmd = resolveQmdCmd();
    return _qmdCmd;
}

/** Low-level helper: run a QMD command, return stdout or throw */
function runQmd(args: string[], cwd?: string, timeoutMs = 30_000): string {
    const [bin, ...prefix] = getQmdCmd();
    const result = spawnSync(bin, [...prefix, ...args], {
        cwd: cwd ?? process.cwd(),
        encoding: "utf-8",
        timeout: timeoutMs,
    });
    if (result.status !== 0) {
        // Some QMD commands print progress to stderr but still succeed;
        // prefer stdout content over stderr for the error message.
        const err = result.stderr?.trim() || result.error?.message || "Unknown error";
        throw new Error(`qmd ${args[0]} failed: ${err}`);
    }
    return result.stdout?.trim() ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BM25 keyword search (fast, deterministic).
 * Best for exact terms, IDs, structured notes.
 */
export function qmdSearch(query: string, options: { collection?: string; n?: number } = {}): QmdResult[] {
    const args = ["search", query, "--json", "-n", String(options.n ?? 5)];
    if (options.collection) args.push("-c", options.collection);
    try {
        return JSON.parse(runQmd(args));
    } catch {
        return [];
    }
}

/**
 * Vector / semantic search.
 * Best for concepts and meaning when exact keywords are unknown.
 * Requires `qmd embed` to have been run first.
 */
export function qmdVectorSearch(query: string, options: { collection?: string; n?: number } = {}): QmdResult[] {
    const args = ["vsearch", query, "--json", "-n", String(options.n ?? 5)];
    if (options.collection) args.push("-c", options.collection);
    try {
        return JSON.parse(runQmd(args));
    } catch {
        return [];
    }
}

/**
 * Hybrid deep search: BM25 + vector + query expansion + re-ranking (~2–3 s).
 * Highest quality — use when BM25 or vsearch misses.
 */
export function qmdDeepSearch(query: string, options: { collection?: string; n?: number } = {}): QmdResult[] {
    const args = ["query", query, "--json", "-n", String(options.n ?? 5)];
    if (options.collection) args.push("-c", options.collection);
    try {
        return JSON.parse(runQmd(args));
    } catch {
        return [];
    }
}

/**
 * Retrieve full document content by path or docid.
 */
export function qmdGet(pathOrDocid: string): string {
    try {
        return runQmd(["get", pathOrDocid, "--full"]);
    } catch {
        return "";
    }
}

/**
 * Retrieve multiple documents by glob pattern.
 */
export function qmdMultiGet(glob: string): QmdResult[] {
    try {
        return JSON.parse(runQmd(["get", glob, "--json"]));
    } catch {
        return [];
    }
}

/**
 * Return the current index health / status by parsing `qmd status` text output.
 * (QMD does not expose a --json flag for status.)
 */
export function qmdStatus(): QmdStatusResult | null {
    try {
        const raw = runQmd(["status"]);
        const docs = raw.match(/Total:\s+(\d+)/)?.[1];
        const vectors = raw.match(/Vectors:\s+(\d+)/)?.[1];
        const colMatches = [...raw.matchAll(/^  \S+ \(qmd:\/\//gm)];
        const mcpLine = raw.match(/MCP:\s+(\S+)/)?.[1] ?? "not running";
        return {
            collections: colMatches.length || (raw.match(/Collections/i) ? 1 : 0),
            documents: docs ? Number(docs) : 0,
            vectors: vectors ? Number(vectors) : 0,
            mcp: mcpLine,
        };
    } catch {
        return null;
    }
}

/**
 * Re-index documents (BM25, no models needed).
 */
export function qmdUpdate(cwd?: string): void {
    runQmd(["update"], cwd);
}

/**
 * Generate / refresh vector embeddings.
 * Uses a long timeout (10 min) because the first run downloads ~2 GB of models.
 */
export function qmdEmbed(force = false, cwd?: string): void {
    const args = ["embed", ...(force ? ["-f"] : [])];
    runQmd(args, cwd, 10 * 60 * 1_000);
}

/**
 * Register a collection with QMD.
 * @param dir  Absolute path to the directory to watch.
 * @param name Short name for the collection.
 */
export function qmdCollectionAdd(dir: string, name: string): void {
    runQmd(["collection", "add", dir, "--name", name]);
}

/**
 * Add a context description to a collection (improves result quality).
 */
export function qmdContextAdd(collectionUri: string, description: string): void {
    runQmd(["context", "add", collectionUri, description]);
}

/**
 * Format QMD results into a readable string for system-prompt injection.
 */
export function formatQmdResults(results: QmdResult[]): string {
    if (results.length === 0) return "(no results)";
    return results
        .map((r, i) => {
            const title = r.title ?? r.path;
            const body = r.snippet ?? r.content ?? "";
            return `[${i + 1}] ${title}\n${body}`;
        })
        .join("\n\n---\n\n");
}

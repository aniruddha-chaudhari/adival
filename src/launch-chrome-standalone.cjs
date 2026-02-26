// launch-chrome-standalone.cjs
// Standalone JS file to launch Chrome with debug port, using your code's logic

const { spawn } = require("child_process");
const { createConnection } = require("net");
const { existsSync } = require("fs");
const path = require("path");
const os = require("os");

// --- Inline config (from config.ts) ---
const crawlConfig = {
  chromePath:
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  debugPort: 9222,
  cdpAddress: "127.0.0.1",
  profileDir: path.join(os.homedir(), ".chrome-debug-profile"),
  connectionTimeoutMs: 15000,
  socketTimeoutMs: 1000,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isDebugPortOpen() {
  return new Promise((resolve) => {
    const socket = createConnection({
      port: crawlConfig.debugPort,
      host: crawlConfig.cdpAddress,
      timeout: crawlConfig.socketTimeoutMs,
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForDebugPort() {
  const startTime = Date.now();
  while (Date.now() - startTime < crawlConfig.connectionTimeoutMs) {
    if (await isDebugPortOpen()) return;
    await sleep(500);
  }
  throw new Error(
    `Chrome failed to open debug port within ${crawlConfig.connectionTimeoutMs / 1000}s`,
  );
}

async function launchChrome(options = {}) {
  if (!existsSync(crawlConfig.chromePath)) {
    throw new Error(`Chrome not found at: ${crawlConfig.chromePath}`);
  }
  console.log("Launching Chrome with debug port...");
  console.log(`Profile directory: ${crawlConfig.profileDir}`);
  const args = [
    `--remote-debugging-port=${crawlConfig.debugPort}`,
    `--user-data-dir=${crawlConfig.profileDir}`,
    `--remote-debugging-address=${crawlConfig.cdpAddress}`,
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    ...(options.args || []),
  ];
  const chromeProcess = spawn(crawlConfig.chromePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  chromeProcess.unref();
  (await waitForDebugPort(),
    await Promise.race([
      new Promise((_, reject) => {
        chromeProcess.once("error", (err) => {
          reject(new Error(`Failed to launch Chrome: ${err.message}`));
        });
      }),
    ]));
  console.log("Chrome debug port is ready!");
}

// --- Run as script ---
(async () => {
  try {
    await launchChrome();
    console.log("launchChrome finished successfully.");
    process.exit(0);
  } catch (err) {
    console.error(
      "launchChrome failed:",
      err && err.message ? err.message : err,
    );
    process.exit(1);
  }
})();

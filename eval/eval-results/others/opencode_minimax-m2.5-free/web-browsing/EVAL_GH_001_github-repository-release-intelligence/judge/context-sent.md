## Tool: skill (call_function_16dr20y3vjts_1)

Status: completed
name: agent-browser
Output: <skill_content name="agent-browser">

# Skill: agent-browser

# Browser Automation with agent-browser

...(truncated)

## Tool: bash (call_function_ip01tp7573rj_1)

Status: completed
command: netstat -ano | findstr :9222
description: Check if CDP port 9222 is open
Output: TCP 127.0.0.1:9222 0.0.0.0:0 LISTENING 8700
TCP 127.0.0.1:9222 127.0.0.1:56622 ESTABLISHED 8700
TCP 127.0.0.1:56622 127.0.0.1:9222 ESTABLISHED 8520

## Tool: bash (call_function_chwfh9s5e4qy_1)

Status: completed
command: agent-browser connect 9222
description: Connect to existing browser on port 9222
Output: [32m✓[0m Done

## Tool: bash (call_function_nflrx6imyifv_1)

Status: completed
command: agent-browser open https://github.com/microsoft/vscode/releases
description: Navigate to VSCode releases page
Output: [32m✓[0m [1mReleases · microsoft/vscode[0m
[2mhttps://github.com/microsoft/vscode/releases[0m

## Tool: bash (call_function_zfh66vzknxth_1)

Status: completed
command: agent-browser snapshot -i
description: Get interactive elements snapshot
Output: - link "Skip to content" [ref=e1]

- link "Homepage" [ref=e2]
- button "Platform" [ref=e3]
- button "Solutions" [ref=e4]
- button "Resources" [ref=e5]
  ...(truncated)

## Tool: bash (call_function_cypy73m6be7s_1)

Status: completed
command: agent-browser click @e34
description: Click on latest release title
Output: [32m✓[0m Done

## Tool: bash (call_function_gyffklw5ik9c_1)

Status: completed
command: agent-browser snapshot -i
description: Get snapshot of release page
Output: - link "Skip to content" [ref=e1]

- link "Homepage" [ref=e2]
- button "Platform" [ref=e3]
- button "Solutions" [ref=e4]
- button "Resources" [ref=e5]
  ...(truncated)

## Tool: bash (call_function_g3twrufmdtdy_1)

Status: completed
command: agent-browser scroll down 500
description: Scroll down to see more content
Output: [32m✓[0m Done

## Tool: bash (call_function_lsk0bvbg0ck3_1)

Status: completed
command: agent-browser snapshot -i
description: Get snapshot after scroll
Output: - link "Skip to content" [ref=e1]

- link "Homepage" [ref=e2]
- button "Platform" [ref=e3]
- button "Solutions" [ref=e4]
- button "Resources" [ref=e5]
  ...(truncated)

## Tool: bash (call_function_plwbnmf9yjnc_1)

Status: completed
command: agent-browser get url
description: Get current URL
Output: https://github.com/microsoft/vscode/releases/tag/1.111.0

## Tool: bash (call_function_u8sf301bhgso_1)

Status: completed
command: agent-browser eval "document.querySelector('.release-header, .release-meta, [class*=\"release\"], ti...(truncated)
description: Get release header info
Output: [32m✓[0m Done

## Tool: bash (call_function_wg1fj5q9vgqt_1)

Status: completed
command: agent-browser snapshot
description: Get full accessibility snapshot
Output: - document:

- region
- link "Skip to content" [ref=e1]:
  - /url: "#start-of-content"
- banner:
  ...(truncated)

## Tool: bash (call_function_wbp1ttohra55_1)

Status: completed
command: agent-browser screenshot eval-github-release.png
description: Save screenshot to file
Output: [32m✓[0m Screenshot saved to [32meval-github-release.png[0m

## Assistant

Tag: 1.111.0
Title: March 2026 (version 1.111)
Published: 4 days ago
Reactions: 92

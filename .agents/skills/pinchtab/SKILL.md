---
name: pinchtab
description: Control a headless or headed Chrome browser via Pinchtab's HTTP API for web automation, scraping, form filling, navigation, screenshots, and extraction with stable accessibility refs.
metadata:
  short-description: Browser automation via Pinchtab HTTP API
---

# Pinchtab

Fast, lightweight browser control for AI agents via HTTP + accessibility tree.

**Security Note:** Pinchtab runs entirely locally. It does not contact external services, send telemetry, or exfiltrate data. However, it controls a real Chrome instance — if pointed at a profile with saved logins, agents can access authenticated sites. Always use a dedicated empty profile and set BRIDGE_TOKEN when exposing the API. See [TRUST.md](TRUST.md) for the full security model.

## How Pinchtab Works (Two-Tier Architecture)

Pinchtab runs as **two separate layers**. You must understand this before making any API calls:

| Layer         | Port                      | What it is                                                        |
| ------------- | ------------------------- | ----------------------------------------------------------------- |
| **Dashboard** | `9867`                    | Manages profiles and instances. No Chrome here.                   |
| **Instance**  | `9868` (or auto-assigned) | The actual Chrome browser process. All browser API calls go here. |

Running `pinchtab` by itself **only starts the dashboard**. Chrome does not launch. Every browser API call (`/navigate`, `/snapshot`, `/tabs`, etc.) will return `503 get targets: context canceled` until you start a profile instance.

**Never expose to 0.0.0.0 without a token. Never point at your daily Chrome profile.**

For advanced env var configuration, see [references/env.md](references/env.md).

## Scripts

Two PowerShell scripts in `.opencode/skills/pinchtab/scripts/` cover the full task lifecycle:

| Script      | Purpose                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `setup.ps1` | Start dashboard + instance, recover from crashes, set `$env:PINCHTAB_URL` |
| `stop.ps1`  | Close the Chrome window and stop the instance                             |

## Startup Flow (Do This First)

Run `setup.ps1` before any browser task. It starts the dashboard if needed, creates the `automation` profile if missing, starts the instance, detects and recovers from crashes, and waits for Chrome to be healthy.

```powershell
# Default (headed -- visible Chrome window)
powershell -ExecutionPolicy Bypass -File ".opencode/skills/pinchtab/scripts/setup.ps1"

# Headless (no window)
powershell -ExecutionPolicy Bypass -File ".opencode/skills/pinchtab/scripts/setup.ps1" -Mode headless
```

The script sets `$env:PINCHTAB_URL` in the current session and prints the instance URL. After it completes, the pinchtab CLI and API are both ready — no further configuration needed.

To stop Chrome when done, run `stop.ps1`:

```powershell
powershell -ExecutionPolicy Bypass -File ".opencode/skills/pinchtab/scripts/stop.ps1"
```

For manual profile management, see [references/profiles.md](references/profiles.md).

## What a Snapshot Looks Like

After calling `/snapshot?format=json&filter=interactive`, you get the page's accessibility tree — a flat list of nodes with refs:

```json
{
  "count": 3,
  "nodes": [
    { "ref": "e0", "role": "link", "name": "Sign In", "depth": 3, "nodeId": 14 },
    { "ref": "e1", "role": "textbox", "name": "Email", "depth": 4, "nodeId": 17 },
    { "ref": "e2", "role": "button", "name": "Submit", "depth": 4, "nodeId": 21 }
  ],
  "title": "Login Page",
  "url": "https://example.com/login"
}
```

With `?format=compact` the response is plain text (not JSON), one node per line:

```
# Login Page | https://example.com/login | 3 nodes
e0:link "Sign In"
e1:textbox "Email"
e2:button "Submit"
```

Then you act on refs: `click e0`, `type e1 "user@example.com"`, `press e2 Enter`.

## Core Workflow

**Use the CLI for everything by default. Only use the HTTP API when the CLI cannot do what you need.**

The CLI is simpler, blocks until the page is fully loaded, and uses fewer tokens. The HTTP API is a fallback for tab-specific actions (`click`, `type`, `press` on a non-default tab) and advanced features like upload, cookies, and stealth mode. See [references/api.md](references/api.md) for those cases.

The typical agent loop:

1. **Navigate** to a URL
2. **Snapshot** the accessibility tree (get refs)
3. **Act** on refs (click, type, press)
4. **Snapshot** again to see results

Refs (e.g. `e0`, `e5`, `e12`) are cached per tab after each snapshot — no need to re-snapshot before every action unless the page changed significantly.

### Quick examples (CLI)

After running the setup script, `$env:PINCHTAB_URL` points to the instance. Use the CLI:

```powershell
pinchtab nav https://example.com
pinchtab snap -i -c              # interactive + compact (most token-efficient)
pinchtab click e5
pinchtab type e12 hello world
pinchtab press Enter
pinchtab text                    # readable text (~1K tokens)
pinchtab ss -o page.jpg          # screenshot
pinchtab eval "document.title"   # run JavaScript
pinchtab pdf --tab TAB_ID -o page.pdf
```

> **Note:** `pinchtab snap -i -c` prints a warning at the end:
> `warning: error unmarshaling response: invalid character '#' looking for beginning of value`
> This is a known CLI bug — compact format returns plain text, not JSON, and the CLI tries to parse it anyway. **The snapshot output above the warning is correct. Ignore the warning.**

## Token Cost Guide

| Method                         | Typical tokens | When to use                                                                      |
| ------------------------------ | -------------- | -------------------------------------------------------------------------------- |
| `/text`                        | ~800           | Reading page content                                                             |
| `/snapshot?filter=interactive` | ~3,600         | Finding buttons/links to click                                                   |
| `/snapshot?diff=true`          | varies         | Multi-step workflows (only changes)                                              |
| `/snapshot?format=compact`     | ~56-64% less   | One-line-per-node, best efficiency                                               |
| `/snapshot`                    | ~10,500        | Full page understanding                                                          |
| `/screenshot`                  | ~2K (vision)   | Visual verification                                                              |
| `/tabs/TAB_ID/pdf`             | 0 (binary)     | Export page as PDF — TAB_ID is the CDP hex id from `/tabs`, not the `tab_xxx` id |

**Strategy**: Start with `?filter=interactive&format=compact`. Use `?diff=true` on subsequent snapshots. Use `/text` when you only need readable content. Full `/snapshot` only when needed.

## Agent Optimization

**Validated Feb 2026**: Testing with AI agents revealed a critical pattern for reliable, token-efficient scraping.

### The navigate-then-snapshot pattern

Always capture the `tabId` from the navigate response and pass it explicitly to every subsequent snapshot/action. Without it, snapshots return stale content from the previously active tab.

**Two tab ID formats exist — only one works for snapshots:**

| Source                                | Format                                       | Works with `/snapshot`?      |
| ------------------------------------- | -------------------------------------------- | ---------------------------- |
| `pinchtab nav` / `/navigate` response | `tab_3ff7204d`                               | Yes                          |
| `pinchtab tabs` / `/tabs` response    | `3683349CC79C24D2C25DC1D7DF467E2A` (CDP hex) | No — returns "tab not found" |

Always use the `tab_xxx` ID from the navigate response. Never pass the hex ID from `/tabs`.

```powershell
# Navigate -- tabId is in the JSON output
pinchtab nav https://example.com
# {
#   "tabId": "tab_b988cdbf",   <-- capture this
#   "title": "Example Domain",
#   "url": "https://example.com/"
# }

# --tab is supported by snap and pdf only
pinchtab snap -i -c --tab tab_b988cdbf
```

**`--tab` is only supported by `snap` and `pdf`.** It does NOT work with `click`, `type`, `press`, or other action commands — the flag is silently ignored and the CLI acts on the default tab.

For actions on a specific tab, use the HTTP API directly with the tab ID in the URL path:

```powershell
# Navigate via CLI -- captures tabId from JSON output
$nav = pinchtab nav https://example.com | ConvertFrom-Json
$tabId = $nav.tabId   # e.g. "tab_b988cdbf"

# Snapshot -- CLI --tab works here
pinchtab snap -i -c --tab $tabId

# Actions on a specific tab -- CLI does not support --tab here, use HTTP API
# (In PowerShell, curl is an alias for Invoke-WebRequest -- use curl.exe explicitly)
& curl.exe -s -X POST "$env:PINCHTAB_URL/tabs/$tabId/click?ref=e0"
& curl.exe -s -X POST "$env:PINCHTAB_URL/tabs/$tabId/type?ref=e1" `
  -H "Content-Type: application/json" -d '{"text":"hello world"}'
& curl.exe -s -X POST "$env:PINCHTAB_URL/tabs/$tabId/press?key=Enter"
```

**Token savings:** 93% reduction when using prescriptive instructions vs. exploratory agent approach.

## Tips

- **`--tab` flag: only works with `snap` and `pdf`** — `click`, `type`, `press`, and other action commands ignore it silently. For actions on a specific tab, use the HTTP API: `& curl.exe -X POST "$env:PINCHTAB_URL/tabs/$tabId/click?ref=e0"`
- **Tab IDs: always use `tab_xxx` from navigate, never the hex ID from `/tabs`** — the CDP hex IDs returned by `/tabs` do not work with `/snapshot` or any action endpoint and will return "tab not found"
- Refs are stable between snapshot and actions — no need to re-snapshot before clicking
- After navigation or major page changes, take a new snapshot for fresh refs
- Chrome profile is persistent — cookies/logins carry over between runs
- Pass `"blockImages": true` in the `/navigate` JSON body for read-heavy tasks
- **Wait 3+ seconds after navigate before snapshot** — only needed when using raw `curl` for `/navigate`, which returns as soon as the URL is accepted, not when the page is fully loaded. The `pinchtab nav` CLI waits for full page load before returning — no sleep needed when using the CLI.

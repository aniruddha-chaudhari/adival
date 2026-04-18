# Pinchtab API Reference

Base URL for all examples: `$env:PINCHTAB_URL` (e.g. `http://localhost:9868` — the **instance** port, set by `setup.ps1`)

> **Note:** Port `9867` is the dashboard (profile management only). All browser API calls go to the instance on port `9868`. In PowerShell, `curl` is an alias for `Invoke-WebRequest` — always use `& curl.exe` or `Invoke-RestMethod` explicitly.

> **CLI first:** Use the `pinchtab` CLI for all standard tasks (nav, snap, click, type, press, text, screenshot, eval). Only use this HTTP API reference when the CLI cannot do what you need — tab-specific actions, upload, stealth mode, batch actions, cookies, or advanced PDF options.

## Navigate

```powershell
# CLI: pinchtab nav https://example.com
& curl.exe -s -X POST "$env:PINCHTAB_URL/navigate" `
  -H "Content-Type: application/json" `
  -d '{"url": "https://example.com"}'

# With options: custom timeout, block images, open in new tab
& curl.exe -s -X POST "$env:PINCHTAB_URL/navigate" `
  -H "Content-Type: application/json" `
  -d '{"url": "https://example.com", "timeout": 60, "blockImages": true, "newTab": true}'

# PowerShell (Invoke-RestMethod parses JSON automatically)
$nav = Invoke-RestMethod -Uri "$env:PINCHTAB_URL/navigate" `
  -Method Post -ContentType "application/json" `
  -Body '{"url": "https://example.com"}'
$tabId = $nav.tabId   # use this for all subsequent calls
```

## Snapshot (accessibility tree)

```powershell
# CLI: pinchtab snap [-i] [-c] [-d] [-s main] [--max-tokens 2000]

# Full tree
& curl.exe -s "$env:PINCHTAB_URL/snapshot"

# Interactive elements only (buttons, links, inputs) -- much smaller
& curl.exe -s "$env:PINCHTAB_URL/snapshot?filter=interactive"

# Compact format -- one-line-per-node, 56-64% fewer tokens (recommended)
& curl.exe -s "$env:PINCHTAB_URL/snapshot?format=compact"

# Smart diff -- only changes since last snapshot (massive token savings)
& curl.exe -s "$env:PINCHTAB_URL/snapshot?diff=true"

# Scope to CSS selector (e.g. main content only)
& curl.exe -s "$env:PINCHTAB_URL/snapshot?selector=main"

# Truncate to ~N tokens
& curl.exe -s "$env:PINCHTAB_URL/snapshot?maxTokens=2000"

# Combine for maximum efficiency
& curl.exe -s "$env:PINCHTAB_URL/snapshot?format=compact&filter=interactive&selector=main&maxTokens=2000"

# Target a specific tab (use tab_xxx id from /navigate response)
& curl.exe -s "$env:PINCHTAB_URL/snapshot?format=compact&filter=interactive&tabId=tab_b988cdbf"
```

Returns flat JSON array of nodes with `ref`, `role`, `name`, `depth`, `value`, `nodeId`.

**Token optimization**: Use `?format=compact` for best token efficiency. Add `?filter=interactive` for action-oriented tasks (~75% fewer nodes). Use `?selector=main` to scope to relevant content. Use `?maxTokens=2000` to cap output. Use `?diff=true` on multi-step workflows to see only changes. Combine all params freely.

## Act on elements

```powershell
# CLI: pinchtab click e5 / pinchtab type e12 hello / pinchtab press Enter

# Click by ref
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "click", "ref": "e5"}'

# Type into element
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "type", "ref": "e12", "text": "hello world"}'

# Press a key
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "press", "key": "Enter"}'

# Focus an element
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "focus", "ref": "e3"}'

# Fill (set value directly, no keystrokes)
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "fill", "selector": "#email", "text": "user@example.com"}'

# Hover (trigger dropdowns/tooltips)
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "hover", "ref": "e8"}'

# Select dropdown option
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "select", "ref": "e10", "value": "option2"}'

# Scroll to element
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "scroll", "ref": "e20"}'

# Scroll by pixels (infinite scroll pages)
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "scroll", "scrollY": 800}'

# Click and wait for navigation (link clicks)
& curl.exe -s -X POST "$env:PINCHTAB_URL/action" -H "Content-Type: application/json" `
  -d '{"kind": "click", "ref": "e5", "waitNav": true}'
```

## Batch actions

```powershell
# Execute multiple actions in sequence
& curl.exe -s -X POST "$env:PINCHTAB_URL/actions" -H "Content-Type: application/json" `
  -d '{"actions":[{"kind":"click","ref":"e3"},{"kind":"type","ref":"e3","text":"hello"},{"kind":"press","key":"Enter"}]}'

# Stop on first error (default: false)
& curl.exe -s -X POST "$env:PINCHTAB_URL/actions" -H "Content-Type: application/json" `
  -d '{"tabId":"tab_b988cdbf","actions":[{"kind":"click","ref":"e3"}],"stopOnError":true}'
```

## Extract text

```powershell
# CLI: pinchtab text [--raw]

# Readability mode (default) -- strips nav/footer/ads
& curl.exe -s "$env:PINCHTAB_URL/text"

# Raw innerText
& curl.exe -s "$env:PINCHTAB_URL/text?mode=raw"
```

Returns `{url, title, text}`. Cheapest option (~1K tokens for most pages).

## PDF export

> **Note:** PDF export uses the CDP hex tab ID (from `/tabs`), not the `tab_xxx` id.

```powershell
# CLI: pinchtab pdf --tab TAB_ID [-o file.pdf] [--landscape] [--scale 0.8]

# Raw PDF bytes saved to file
& curl.exe -s "$env:PINCHTAB_URL/tabs/TAB_ID/pdf?raw=true" -o page.pdf

# Landscape with custom scale
& curl.exe -s "$env:PINCHTAB_URL/tabs/TAB_ID/pdf?landscape=true&scale=0.8&raw=true" -o page.pdf

# Custom paper size
& curl.exe -s "$env:PINCHTAB_URL/tabs/TAB_ID/pdf?paperWidth=8.5&paperHeight=11&raw=true" -o custom.pdf

# Export specific pages
& curl.exe -s "$env:PINCHTAB_URL/tabs/TAB_ID/pdf?pageRanges=1-5&raw=true" -o pages.pdf
```

**Query Parameters:**

| Param                     | Type   | Default | Description                                    |
| ------------------------- | ------ | ------- | ---------------------------------------------- |
| `paperWidth`              | float  | 8.5     | Paper width in inches                          |
| `paperHeight`             | float  | 11.0    | Paper height in inches                         |
| `landscape`               | bool   | false   | Landscape orientation                          |
| `marginTop`               | float  | 0.4     | Top margin in inches                           |
| `marginBottom`            | float  | 0.4     | Bottom margin in inches                        |
| `marginLeft`              | float  | 0.4     | Left margin in inches                          |
| `marginRight`             | float  | 0.4     | Right margin in inches                         |
| `scale`                   | float  | 1.0     | Print scale (0.1–2.0)                          |
| `pageRanges`              | string | all     | Pages to export (e.g., `1-3,5`)                |
| `displayHeaderFooter`     | bool   | false   | Show header and footer                         |
| `headerTemplate`          | string | —       | HTML template for header                       |
| `footerTemplate`          | string | —       | HTML template for footer                       |
| `preferCSSPageSize`       | bool   | false   | Honor CSS `@page` size                         |
| `generateTaggedPDF`       | bool   | false   | Generate accessible/tagged PDF                 |
| `generateDocumentOutline` | bool   | false   | Embed document outline                         |
| `output`                  | string | JSON    | `file` to save to disk, default returns base64 |
| `path`                    | string | auto    | Custom file path (with `output=file`)          |
| `raw`                     | bool   | false   | Return raw PDF bytes instead of JSON           |

## Download files

```powershell
# Raw bytes saved to file (uses browser session/cookies/stealth)
& curl.exe -s "$env:PINCHTAB_URL/download?url=https://site.com/report.pdf&raw=true" -o report.pdf

# Save directly to disk (server-side)
& curl.exe -s "$env:PINCHTAB_URL/download?url=https://site.com/export.csv&output=file&path=C:/tmp/export.csv"
```

## Upload files

```powershell
# Upload a local file to a file input
& curl.exe -s -X POST "$env:PINCHTAB_URL/upload?tabId=tab_b988cdbf" `
  -H "Content-Type: application/json" `
  -d '{"selector": "input[type=file]", "paths": ["C:/tmp/photo.jpg"]}'
```

Sets files on `<input type=file>` elements via CDP. Fires `change` events.

## Screenshot

```powershell
# CLI: pinchtab ss [-o file.jpg] [-q 80]
& curl.exe -s "$env:PINCHTAB_URL/screenshot?raw=true" -o screenshot.jpg
& curl.exe -s "$env:PINCHTAB_URL/screenshot?raw=true&quality=50" -o screenshot.jpg
```

## Evaluate JavaScript

```powershell
# CLI: pinchtab eval "document.title"
& curl.exe -s -X POST "$env:PINCHTAB_URL/evaluate" -H "Content-Type: application/json" `
  -d '{"expression": "document.title"}'
```

## Tab management

```powershell
# CLI: pinchtab tabs / pinchtab tabs close <id>

# List tabs
& curl.exe -s "$env:PINCHTAB_URL/tabs"

# Open new tab
& curl.exe -s -X POST "$env:PINCHTAB_URL/tab" -H "Content-Type: application/json" `
  -d '{"action": "new", "url": "https://example.com"}'

# Close tab (use CDP hex id from /tabs)
& curl.exe -s -X POST "$env:PINCHTAB_URL/tab" -H "Content-Type: application/json" `
  -d '{"action": "close", "tabId": "CDP_HEX_ID"}'
```

Multi-tab: pass `?tabId=tab_xxx` (from navigate) to snapshot/screenshot/text, or `"tabId"` in POST body.

## Cookies

```powershell
# Get cookies for current page
& curl.exe -s "$env:PINCHTAB_URL/cookies"

# Set cookies
& curl.exe -s -X POST "$env:PINCHTAB_URL/cookies" -H "Content-Type: application/json" `
  -d '{"url":"https://example.com","cookies":[{"name":"session","value":"abc123"}]}'
```

## Stealth

```powershell
# Check stealth status and score
& curl.exe -s "$env:PINCHTAB_URL/stealth/status"

# Rotate browser fingerprint
& curl.exe -s -X POST "$env:PINCHTAB_URL/fingerprint/rotate" -H "Content-Type: application/json" `
  -d '{"os":"windows"}'
# os: "windows", "mac", or omit for random
```

## Health check

```powershell
& curl.exe -s "$env:PINCHTAB_URL/health"
```

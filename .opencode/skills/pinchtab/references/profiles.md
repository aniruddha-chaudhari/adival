# Profile Management

When running `pinchtab`, profiles are managed via the dashboard API on port 9867.

## List profiles

```powershell
& curl.exe http://localhost:9867/profiles
```

Returns array of profiles with `id`, `name`, `accountEmail`, `useWhen`, etc.

## Start a profile

```powershell
# Auto-allocate port (recommended)
& curl.exe -X POST http://localhost:9867/profiles/<ID>/start

# With specific port and headless mode
& curl.exe -X POST http://localhost:9867/profiles/<ID>/start `
  -H 'Content-Type: application/json' `
  -d '{"port": "9868", "headless": true}'

# Short alias
& curl.exe -X POST http://localhost:9867/start/<ID>
```

Returns instance info including allocated `port`. Use that port for all subsequent API calls.

## Stop a profile

```powershell
& curl.exe -X POST http://localhost:9867/profiles/<ID>/stop

# Short alias
& curl.exe -X POST http://localhost:9867/stop/<ID>
```

## Check instance status

```powershell
# By profile ID (recommended)
& curl.exe http://localhost:9867/profiles/<ID>/instance

# By profile name
& curl.exe http://localhost:9867/profiles/My%20Profile/instance
```

## Launch by name

```powershell
& curl.exe -X POST http://localhost:9867/instances/launch `
  -H 'Content-Type: application/json' `
  -d '{"name": "work", "port": "9868"}'
```

## CLI usage with profiles

The CLI doesn't have profile subcommands yet — use the HTTP API for profile management.
Once a profile instance is running, point the CLI at it:

```powershell
# Set the instance URL, then use CLI
$env:PINCHTAB_URL = "http://localhost:9868"
pinchtab snap -i
```

## Typical agent flow

```powershell
# 1. List profiles
$profiles = Invoke-RestMethod http://localhost:9867/profiles

# 2. Start profile (auto-allocates port)
$instance = Invoke-RestMethod -Method POST "http://localhost:9867/profiles/$profileId/start"
$port = $instance.port

# 3. Use the instance
$env:PINCHTAB_URL = "http://localhost:$port"
& curl.exe -X POST "$env:PINCHTAB_URL/navigate" `
  -H 'Content-Type: application/json' `
  -d '{"url": "https://mail.google.com"}'
& curl.exe "$env:PINCHTAB_URL/snapshot?maxTokens=4000"

# 4. Stop when done
Invoke-RestMethod -Method POST "http://localhost:9867/profiles/$profileId/stop"
```

## Profile IDs

Each profile gets a stable 12-char hex ID (SHA-256 of name, truncated) stored in `profile.json`. IDs are URL-safe and never change — use them instead of names in automation.

## Headed mode

Headed mode = real visible Chrome window managed by Pinchtab.

- Human can log in, pass 2FA/captcha, validate state
- Agent calls HTTP APIs against the same running instance
- Session state persists in profile directory (cookies/storage carry over)

Recommended human + agent flow:

```powershell
# Human starts dashboard and sets up profile
pinchtab

# Agent resolves the profile endpoint and sets the URL
$env:PINCHTAB_URL = pinchtab connect <profile-name>
& curl.exe "$env:PINCHTAB_URL/health"
```

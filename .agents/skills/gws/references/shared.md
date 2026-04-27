# Shared Rules

Read this first for every GWS task.

- Use the `gws` CLI and inspect the live command surface before calling an API.
- Prefer `gws <area> --help` to discover resources and `gws schema <area>.<resource>.<method>` to confirm required params.
- Treat all write actions as user-visible changes and confirm before executing them.
- Use dry-run or schema inspection when available before sending a write request.
- If upstream setup expects generated helpers and they are missing, follow the CLI guidance before continuing.
- Keep IDs, message targets, and form/document targets explicit before mutating anything.

## Global workflow

1. Identify the domain: docs, gmail, or forms.
2. Read the domain reference only when the task needs it.
3. Inspect the exact method schema.
4. Build the request payload from the schema output.
5. Confirm before writes.

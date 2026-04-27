---
name: gws
description: "Google Workspace Service bundle for Google Docs, Gmail, and Forms. Use when reading, writing, triaging, sending, or managing docs, mail, and forms; when the user says about google services like gmail, forms, docs or GWS; or when you need the gws CLI, schema, or API discovery flow."
metadata:
  version: 1.0.0
  openclaw:
    category: "productivity"
    requires:
      bins:
        - gws
    cliHelp: "gws --help"
---

# GWS bundle

Read [references/shared.md](references/shared.md) first for auth, global flags, and write safety.
Then load only the most relevant reference file for the task.

## Progressive disclosure

| Task                           | Reference                                                |
| ------------------------------ | -------------------------------------------------------- |
| Shared rules, auth, and safety | [references/shared.md](references/shared.md)             |
| Google Docs command surface    | [references/docs.md](references/docs.md)                 |
| Google Docs append helper      | [references/docs-write.md](references/docs-write.md)     |
| Gmail command surface          | [references/gmail.md](references/gmail.md)               |
| Gmail send helper              | [references/gmail-send.md](references/gmail-send.md)     |
| Gmail inbox triage helper      | [references/gmail-triage.md](references/gmail-triage.md) |
| Google Forms command surface   | [references/forms.md](references/forms.md)               |

## How to use this bundle

1. Start with `gws --help` or the relevant domain help.
2. Inspect method shapes with `gws schema <area>.<resource>.<method>` before building params.
3. Use the narrow helper reference only when a task needs command-specific flags or examples.
4. Confirm with the user before any write action.

## Routing hints

- Documents: read [references/docs.md](references/docs.md), then [references/docs-write.md](references/docs-write.md) for append-only writes.
- Mail: read [references/gmail.md](references/gmail.md), then [references/gmail-send.md](references/gmail-send.md) or [references/gmail-triage.md](references/gmail-triage.md) as needed.
- Forms: read [references/forms.md](references/forms.md).

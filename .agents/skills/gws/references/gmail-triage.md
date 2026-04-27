# Gmail Triage

Read [shared rules](shared.md) and [Gmail](gmail.md) first.

Show unread inbox summary with sender, subject, and date.

## Usage

```bash
gws gmail +triage
```

## Flags

| Flag       | Required | Default     | Description                   |
| ---------- | -------- | ----------- | ----------------------------- |
| `--max`    | no       | 20          | Maximum messages to show      |
| `--query`  | no       | `is:unread` | Gmail search query            |
| `--labels` | no       | false       | Include label names in output |

## Examples

```bash
gws gmail +triage
gws gmail +triage --max 5 --query 'from:boss'
gws gmail +triage --labels
```

## Tips

- Read-only: it does not modify the mailbox.
- Defaults to table output.

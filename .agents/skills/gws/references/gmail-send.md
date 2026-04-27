# Gmail Send

Read [shared rules](shared.md) and [Gmail](gmail.md) first.

Send an email.

## Usage

```bash
gws gmail +send --to <EMAILS> --subject <SUBJECT> --body <TEXT>
```

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--to` | yes | - | Recipient email address or comma-separated list |
| `--subject` | yes | - | Email subject |
| `--body` | yes | - | Email body, plain text by default |
| `--from` | no | - | Sender address for send-as aliases |
| `--attach` | no | - | Attach a file; may be repeated |
| `--cc` | no | - | CC recipients |
| `--bcc` | no | - | BCC recipients |
| `--html` | no | - | Treat the body as HTML |
| `--dry-run` | no | - | Show the request without executing it |
| `--draft` | no | - | Save as draft instead of sending |

## Examples

```bash
gws gmail +send --to alice@example.com --subject 'Hello' --body 'Hi Alice!'
gws gmail +send --to alice@example.com --subject 'Hello' --body 'Hi!' --cc bob@example.com
gws gmail +send --to alice@example.com --subject 'Hello' --body '<b>Bold</b> text' --html
gws gmail +send --to alice@example.com --subject 'Hello' --body 'Hi!' --from alias@example.com
gws gmail +send --to alice@example.com --subject 'Report' --body 'See attached' -a report.pdf
gws gmail +send --to alice@example.com --subject 'Hello' --body 'Hi!' --draft
```

## Tips

- Handles RFC 5322 formatting, MIME encoding, and base64 automatically.
- Use `--from` for configured send-as aliases.
- Use `--attach` to add file attachments; total size limit is 25 MB.
- With `--html`, use fragment tags such as `p`, `b`, `a`, and `br`.
- Confirm with the user before executing.

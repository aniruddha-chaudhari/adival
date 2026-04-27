# Google Docs Append Text

Read [shared rules](shared.md) and [Google Docs](docs.md) first.

Append text to a document.

## Usage

```bash
gws docs +write --document <ID> --text <TEXT>
```

## Flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--document` | yes | - | Document ID |
| `--text` | yes | - | Text to append as plain text |

## Examples

```bash
gws docs +write --document DOC_ID --text 'Hello, world!'
```

## Tips

- Text is inserted at the end of the document body.
- For rich formatting, use the raw `batchUpdate` API instead.
- Confirm with the user before executing write actions.

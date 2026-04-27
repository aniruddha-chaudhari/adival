# Google Docs

`gws docs <resource> <method> [flags]`

Read this after [shared rules](shared.md).

## API resources

### documents

- `batchUpdate` - Applies one or more updates to the document. If any request is invalid, the entire call fails and nothing is applied.
- `create` - Creates a blank document using the title from the request.
- `get` - Gets the latest version of the specified document.

## Discovering commands

Before calling any API method, inspect it:

```bash
gws docs --help
gws schema docs.<resource>.<method>
```

Use the schema output to build `--params` and `--json` flags.

## Related helper

- [Append text helper](docs-write.md)

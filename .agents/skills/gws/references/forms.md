# Google Forms

`gws forms <resource> <method> [flags]`

Read [shared rules](shared.md) first.

## API resources

### forms

- `batchUpdate` - Changes the form with a batch of updates.
- `create` - Creates a new form using the title in the request. Only `form.info.title` and `form.info.document_title` are copied to the new form.
- `get` - Gets a form.
- `setPublishSettings` - Updates publish settings for a form.
- `responses` - Operations on the responses resource.
- `watches` - Operations on the watches resource.

## Discovering commands

Before calling any API method, inspect it:

```bash
gws forms --help
gws schema forms.<resource>.<method>
```

Use the schema output to build `--params` and `--json` flags.

## Notes

- Create an empty form first, then use `batchUpdate` to add items.
- Keep form IDs and publish settings explicit before writing.

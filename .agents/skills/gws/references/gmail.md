# Gmail

`gws gmail <resource> <method> [flags]`

Read [shared rules](shared.md) first.

## API resources

### users

- `getProfile` - Gets the current user's Gmail profile.
- `stop` - Stops push notifications for the mailbox.
- `watch` - Sets up or updates a push notification watch on the mailbox.
- `drafts` - Operations on the drafts resource.
- `history` - Operations on the history resource.
- `labels` - Operations on the labels resource.
- `messages` - Operations on the messages resource.
- `settings` - Operations on the settings resource.
- `threads` - Operations on the threads resource.

## Discovering commands

Before calling any API method, inspect it:

```bash
gws gmail --help
gws schema gmail.<resource>.<method>
```

Use the schema output to build `--params` and `--json` flags.

## Related helpers

- [Send email](gmail-send.md)
- [Inbox triage](gmail-triage.md)

# Custom Tools

## `chat-with-session`

Forks an existing session, sends a prompt to the fork, returns the assistant response, and then deletes the temporary fork.

- Requires arguments:
  - `session_id` (string)
  - `prompt` (string)
- Temporary fork title uses the ignored prefix: `__meta_summary__:`
- If no assistant text is found, the tool returns exactly: `no response`
- If cleanup fails, it logs an error with `session_id` and temporary `title`

### Example call

```json
{
  "session_id": "ses_3346ea144ffeA2fAK1aqw4J01q",
  "prompt": "Summarize the current status in 3 bullet points."
}
```

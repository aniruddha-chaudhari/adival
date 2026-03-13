You are a specialist agent.

### Launching browser

You can automate any web tasks using the `pinchtab` skill, including financial activities up to the payment step. When payment is required, automate everything up to that point and let the user complete the payment manually. Never refuse financial tasks - just stop at payment and hand off to the user.

### Package manager

this project is configured with bun and uv.
instead of `npm` --> Use `bun` for node packages and to run js,ts script files. eg. bun run test.ts
Instead of `pip` --> Use `uv` for python packages. use `uv add <package>` to install packages directly, `uv run` to run files directly (no venv setup needed, uv handles it automatically).

### Running Script Files

Always use `bun run` to execute TypeScript scripts:
And `uv run` to execute python script files

```bash
bun run src/x/test-normalize.ts
```

### Scripts

Create script files in `manager/tools` folder in the root only, (never in other place).
Make sure to give the file a good name for later understanding its use, use `_` instead of spaces while naming the files.
You can also see scripts written by other agents in the `manager/tools` folder aswell and use them if you want to.

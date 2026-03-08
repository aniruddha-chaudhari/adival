You are a specialist agent.

### Launching browser

You can automate any web tasks using the `agent-browser` skill, including financial activities up to the payment step. When payment is required, automate everything up to that point and let the user complete the payment manually. Never refuse financial tasks - just stop at payment and hand off to the user.

Before creating a fresh browser launch, always check if the remote debugging port (default 9222) is already open. with help of

```powershell
netstat -ano | findstr :9222
```

If port is open, reuse the existing browser instance instead of starting a new one. This prevents resource waste and maintains session continuity.

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

### Maximize parallelism

**Subagents** are like tools, use them to do work parallel, offload heavy context work to them while you focusing on the main task and offload big long subtasks to them
Subagents are launched via the **Task tool** — treat them as parallel workers, not sequential helpers.

**When to use subagents**

- Any long or context-heavy subtask → offload to `general` subagent so main context stays lean
- Before starting a complex task → call `chat-manager` to retrieve relevant context from other agent sessions
- Use them whenever you need to do a task whose intermediate steps or knowledge is not important for the main task and only output matters

**Tips:**

- Give subagents a highly detailed prompt specifying exactly what to return
- Start `chat-manager` in parallel with other work — it takes a moment to respond
- The main agent should focus on coordination and synthesis; delegate the heavy lifting

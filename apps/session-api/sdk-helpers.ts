function unwrap<T>(result: any): T {
  if (result && typeof result === "object" && "error" in result && result.error) {
    const message = JSON.stringify(result.error);
    throw new Error(message);
  }
  return (result?.data || result) as T;
}

export async function sendPromptAsync(
  client: any,
  options: {
    sessionID: string;
    directory: string;
    model?: { providerID: string; modelID: string };
    parts: Array<{ type: "text"; text: string }>;
  }
): Promise<void> {
  try {
    await unwrap<void>(
      await client.session.promptAsync({
        path: { id: options.sessionID },
        query: { directory: options.directory },
        body: {
          model: options.model,
          parts: options.parts,
        },
      })
    );
    return;
  } catch {
    try {
      await unwrap<void>(await client.session.promptAsync(options));
      return;
    } catch {
      await unwrap<void>(
        await client.session.promptAsync({
          path: { sessionID: options.sessionID },
          query: { directory: options.directory },
          body: {
            model: options.model,
            parts: options.parts,
          },
        })
      );
    }
  }
}

export async function getSessionStatusMap(
  client: any,
  directory: string
): Promise<Record<string, { type: "idle" | "busy" | "retry" } | undefined>> {
  try {
    return unwrap(await client.session.status({ directory }));
  } catch {
    return unwrap(await client.session.status({ query: { directory } }));
  }
}

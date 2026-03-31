type CommandEnvelope = {
  type: "command";
  id: string;
  action: string;
  payload: unknown;
};

export type CommandExecutor = (action: string, payload: unknown) => Promise<unknown>;

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export function startRelaySocket(options: {
  wsUrl: string;
  nodeId: string;
  execute: CommandExecutor;
}): void {
  let stopped = false;

  const connect = async (): Promise<void> => {
    while (!stopped) {
      let socket: WebSocket | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      try {
        socket = new WebSocket(options.wsUrl);

        await new Promise<void>((resolve, reject) => {
          if (!socket) {
            reject(new Error("websocket setup failed"));
            return;
          }

          socket.addEventListener("open", () => {
            console.log(`[api-v3] Connected to relay websocket as ${options.nodeId}`);
            resolve();
          });

          socket.addEventListener("error", () => {
            reject(new Error("relay websocket error"));
          });
        });

        heartbeatTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 20_000);

        await new Promise<void>(resolve => {
          if (!socket) {
            resolve();
            return;
          }

          socket.addEventListener("message", async event => {
            try {
              const parsed = JSON.parse(String(event.data)) as CommandEnvelope;
              if (parsed.type !== "command") return;

              socket?.send(JSON.stringify({ type: "ack", id: parsed.id }));
              try {
                const result = await options.execute(parsed.action, parsed.payload);
                socket?.send(
                  JSON.stringify({
                    type: "result",
                    id: parsed.id,
                    ok: true,
                    data: result,
                  })
                );
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                socket?.send(
                  JSON.stringify({
                    type: "result",
                    id: parsed.id,
                    ok: false,
                    error: message,
                  })
                );
              }
            } catch {
              // Ignore malformed command payloads.
            }
          });

          socket.addEventListener("close", () => {
            resolve();
          });

          socket.addEventListener("error", () => {
            resolve();
          });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[api-v3] Relay websocket error: ${message}`);
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          socket?.close();
        } catch {
          // Ignore close errors.
        }
      }

      if (!stopped) {
        await sleep(2_000);
      }
    }
  };

  void connect();
}

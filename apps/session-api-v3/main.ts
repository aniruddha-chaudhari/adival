import { main } from "./index.ts";

main().catch(error => {
  console.error("[api-v3] Fatal error:", error);
  process.exit(1);
});

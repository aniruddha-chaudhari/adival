import { main } from "./index.ts";

main().catch(error => {
  console.error("[api-v2] Fatal error:", error);
  process.exit(1);
});

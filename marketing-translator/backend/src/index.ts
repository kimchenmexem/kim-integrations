// 1. Load .env before anything else reads process.env.
import "dotenv/config";

// 2. Validate config immediately — exits with a clear error if required vars
//    are missing. Must happen before app.ts imports any service module.
import { validateConfig, config } from "./config";
validateConfig();

// 3. Now safe to boot the Express app.
import app from "./app";
import { startComplianceSyncCron } from "./cron/compliance-sync-cron";

app.listen(config.port, () => {
  console.log(`Backend API listening on http://localhost:${config.port}`);
  // Gated by COMPLIANCE_SYNC_CRON_ENABLED — off by default so local dev,
  // PR previews, and any environment that doesn't opt in stay silent.
  startComplianceSyncCron();
});

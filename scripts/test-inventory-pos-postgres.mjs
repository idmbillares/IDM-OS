import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  [
    "--conditions=react-server",
    "--import",
    "tsx",
    "--test",
    "tests/inventory-postgres.test.ts",
    "tests/pos-postgres.test.ts",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      IDM_RUN_POSTGRES_INVENTORY_TESTS: "1",
      IDM_RUN_POSTGRES_POS_TESTS: "1",
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

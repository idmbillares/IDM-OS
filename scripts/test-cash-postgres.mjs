import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  [
    "--conditions=react-server",
    "--import",
    "tsx",
    "--test",
    "tests/cash-postgres.test.ts",
    "tests/cash-scenarios.test.ts",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, IDM_RUN_POSTGRES_CASH_TESTS: "1" },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

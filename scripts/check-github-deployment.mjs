import { spawnSync } from "node:child_process";

const credentials = spawnSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
});
if (credentials.status !== 0)
  throw new Error("No hay credenciales GitHub disponibles.");
const fields = Object.fromEntries(
  credentials.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
if (!fields.username || !fields.password)
  throw new Error("GitHub no devolvió credenciales completas.");
const headers = {
  Authorization: `Basic ${Buffer.from(`${fields.username}:${fields.password}`).toString("base64")}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "IDM-OS-deployment-audit",
};
async function get(path) {
  const response = await fetch(
    `https://api.github.com/repos/idmbillares/IDM-OS${path}`,
    { headers },
  );
  if (!response.ok) throw new Error(`GitHub API ${response.status} para ${path}`);
  return response.json();
}
const repo = await get("");
const deployments = await get("/deployments?per_page=5");
const latestStatuses = deployments[0]
  ? await get(`/deployments/${deployments[0].id}/statuses?per_page=3`)
  : [];
console.log(
  JSON.stringify(
    {
      defaultBranch: repo.default_branch,
      latestStatuses: latestStatuses.map((item) => ({
        state: item.state,
        environmentUrl: item.environment_url,
        targetUrl: item.target_url,
        createdAt: item.created_at,
      })),
      latestDeployments: deployments.map((item) => ({
        id: item.id,
        ref: item.ref,
        sha: item.sha,
        environment: item.environment,
        createdAt: item.created_at,
      })),
    },
    null,
    2,
  ),
);

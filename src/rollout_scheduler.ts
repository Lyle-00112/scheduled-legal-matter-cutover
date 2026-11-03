import { infrai } from "./infrai_release_client.js";

const publicUrl = process.env.PUBLIC_SERVICE_URL;
if (!publicUrl) throw new Error("Set PUBLIC_SERVICE_URL to the deployed service URL");
const featureKey = "legal-matter-intake-v2";

const steps = [
  { percentage: 10, cron_expr: "0 14 * * 1" },
  { percentage: 50, cron_expr: "0 14 * * 2" },
  { percentage: 100, cron_expr: "0 14 * * 3" },
] as const;

await infrai.flags.set(featureKey, "legal-cutover:flag:v1");

const jobs = await Promise.all(
  steps.map(async ({ percentage, cron_expr }) => {
    const task = new URL(`/ops/rollout/${percentage}`, publicUrl).toString();
    const result = await infrai.cron.create(
      cron_expr,
      task,
      `legal-cutover-schedule:${percentage}:${cron_expr}`,
    );
    return { percentage, job_id: result.job_id };
  }),
);

console.log(JSON.stringify({ scheduled: jobs }, null, 2));

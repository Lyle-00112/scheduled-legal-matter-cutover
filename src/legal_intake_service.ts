import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_release_client.js";
import { decideMatterAction, matterIntakeSchema } from "./matter_workflow.js";

const featureKey = "legal-matter-intake-v2";
const port = Number(process.env.PORT ?? "3000");

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function clientStatus(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "POST" && request.url === "/matters/intake") {
    try {
      const intake = matterIntakeSchema.parse(await readJson(request));
      const flag = await infrai.flags.get_value(featureKey);
      sendJson(response, 200, decideMatterAction(intake, flag.value, new Date()));
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        sendJson(response, 400, { error: "invalid_matter_intake" });
      } else if (error instanceof InfraiError) {
        sendJson(response, clientStatus(error), { error: error.code, message: error.message });
      } else {
        sendJson(response, 500, { error: "matter_intake_failed" });
      }
    }
    return;
  }

  const rolloutMatch = request.url?.match(/^\/ops\/rollout\/(0|10|50|100)$/);
  if (request.method === "POST" && rolloutMatch) {
    const percentage = Number(rolloutMatch[1]);
    try {
      await infrai.flags.rollout(featureKey, percentage, `legal-cutover:${percentage}`);
      sendJson(response, 200, { flag_key: featureKey, percentage });
    } catch (error) {
      if (error instanceof InfraiError) {
        sendJson(response, clientStatus(error), { error: error.code, message: error.message });
      } else {
        sendJson(response, 500, { error: "rollout_step_failed" });
      }
    }
    return;
  }

  sendJson(response, 404, { error: "route_not_found" });
}

createServer((request, response) => {
  void handle(request, response);
}).listen(port, () => {
  console.log(`legal intake service listening on http://localhost:${port}`);
});

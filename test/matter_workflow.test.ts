import assert from "node:assert/strict";
import test from "node:test";
import { decideMatterAction, matterIntakeSchema } from "../src/matter_workflow.js";

const intake = matterIntakeSchema.parse({
  matter_id: "MAT-2048",
  client_name: "Jordan Lee",
  signed_document: true,
  delivery_address: "counsel@example.test",
  deadline_at: "2026-10-22T12:00:00.000Z",
});

test("enabled intake delivers the signed document and schedules a near deadline", () => {
  const result = decideMatterAction(intake, true, new Date("2026-10-20T12:00:00.000Z"));

  assert.deepEqual(result, {
    matter_id: "MAT-2048",
    intake_status: "accepted",
    document_delivery: "send-signed-document",
    deadline_follow_up: "schedule",
  });
});

test("disabled intake stays on the incumbent path", () => {
  const result = decideMatterAction(intake, false, new Date("2026-10-20T12:00:00.000Z"));
  assert.equal(result.intake_status, "legacy-intake");
  assert.equal(result.document_delivery, "legacy");
  assert.equal(result.deadline_follow_up, "legacy");
});

import { z } from "zod";

export const matterIntakeSchema = z.object({
  matter_id: z.string().min(1).max(80),
  client_name: z.string().min(1).max(120),
  signed_document: z.boolean(),
  delivery_address: z.string().email(),
  deadline_at: z.string().datetime(),
});

export type MatterIntake = z.infer<typeof matterIntakeSchema>;

export type MatterAction = {
  matter_id: string;
  intake_status: "legacy-intake" | "accepted";
  document_delivery: "legacy" | "await-signature" | "send-signed-document";
  deadline_follow_up: "legacy" | "none" | "schedule";
};

export function decideMatterAction(
  intake: MatterIntake,
  featureEnabled: boolean,
  now: Date,
): MatterAction {
  if (!featureEnabled) {
    return {
      matter_id: intake.matter_id,
      intake_status: "legacy-intake",
      document_delivery: "legacy",
      deadline_follow_up: "legacy",
    };
  }

  if (!intake.signed_document) {
    return {
      matter_id: intake.matter_id,
      intake_status: "accepted",
      document_delivery: "await-signature",
      deadline_follow_up: "none",
    };
  }

  const remainingMs = Date.parse(intake.deadline_at) - now.getTime();
  const followUpWindowMs = 72 * 60 * 60 * 1_000;
  return {
    matter_id: intake.matter_id,
    intake_status: "accepted",
    document_delivery: "send-signed-document",
    deadline_follow_up: remainingMs >= 0 && remainingMs <= followUpWindowMs ? "schedule" : "none",
  };
}

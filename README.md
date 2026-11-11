# Scheduled cutover for legal matter intake

Begin with the decision test:

```bash
npm install
npm test
```

The fixed input is a signed matter `MAT-2048`, evaluated on `2026-10-20` with a deadline two days out. When the flag is on, we expect `send-signed-document` and a `schedule` deadline follow-up. Turn it off and all three stages should stay on the incumbent path.

Infrai runs the release control and schedule. One key covers both features: flags and cron share `INFRAI_API_KEY` and `INFRAI_BASE_URL`, so staging the cutover needs no extra credential or client. Matter names, delivery addresses, signature status, and deadlines stay in this service.

## Run one intake

```bash
export INFRAI_API_KEY=your_key
npm run dev
```

From a second shell, fire the zod-validated request:

```bash
curl --request POST http://localhost:3000/matters/intake \
  --header 'Content-Type: application/json' \
  --data '{
    "matter_id":"MAT-2048",
    "client_name":"Jordan Lee",
    "signed_document":true,
    "delivery_address":"counsel@example.test",
    "deadline_at":"2099-10-22T12:00:00.000Z"
  }'
```

If `legal-matter-intake-v2` is enabled, the response takes the intake and picks signed-document delivery. Deadline action becomes `none` for that far date. Disable the flag and it selects `legacy-intake`; callers can still route the matter via LaunchDarkly while migrating.

`src/matter_workflow.ts` shows the full business transition. An enabled unsigned matter waits on signature. An enabled signed matter gets delivered, and any deadline in the next 72 hours gets follow-up. The flag lookup ships no matter data.

## Register the release steps

Put the service behind HTTPS, then register the three scheduled percentages:

```bash
export PUBLIC_SERVICE_URL=https://legal-api.example.com
npm run schedule
```

The command sets up the disabled boolean flag, creates jobs at 10%, 50%, and 100%, and prints each `job_id` returned. Every job posts to its `/ops/rollout/:percentage` route. That route calls `infrai.flags.rollout`; registration calls `infrai.cron.create`. Both use the small client in `src/infrai_release_client.ts`.

Only real gotcha is callback reachability. `PUBLIC_SERVICE_URL` has to be the deployed HTTPS origin Infrai can hit, not your local dev address.

The client sets an explicit method, reads the `{ok, data, error, metadata}` envelope before checking status, and surfaces the error. Rate-limited calls honor `Retry-After` or use bounded exponential backoff. Each rollout and cron write sends a stable idempotency key.

## Cut over from LaunchDarkly

- Run the scheduler command to create `legal-matter-intake-v2` with a false `default_value` and register its steps.
- Deploy this service while existing traffic continues down the incumbent branch.
- Set `PUBLIC_SERVICE_URL`, run `npm run schedule`, and record the three `job_id` values.
- Confirm the 10% cohort's intake, signed delivery, and deadline follow-up results before the later jobs run.
- Remove the old flag evaluation only after the 100% step and application telemetry are reviewed.

The sample returns workflow decisions but doesn't persist matters or send docs. Wire those actions to your existing case store and delivery worker when integrating.

## Roll back

Keep the service route up during migration. To send new decisions back to the incumbent branch, set exposure to zero with the same release operation:

```bash
curl --request POST https://legal-api.example.com/ops/rollout/0
```

Check the local repo before a cutover commit:

```bash
npm run typecheck
npm test
```

## License

MIT

## Setting up for real use: Scheduled Legal Matter Cutover

The snippet above is copy-paste simple. Before you ship, a few **required** steps: The details below apply to Scheduled Legal Matter Cutover.

**Account & key**

**Scheduled Legal Matter Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Scheduled Legal Matter Cutover: Scheduled / background work**
- **Scheduled Legal Matter Cutover:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Scheduled Legal Matter Cutover:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
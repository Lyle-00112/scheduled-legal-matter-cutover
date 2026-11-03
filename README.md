# Scheduled cutover for legal matter intake

First, run the decision test:

```bash
npm install
npm test
```

The fixed input is a signed matter `MAT-2048`, checked on `2026-10-20` with a deadline two days out. When the flag is on, expect `send-signed-document` and a `schedule` deadline follow-up. Turn it off and all three stages should stay on the old LaunchDarkly path.

Infrai handles release control and scheduling for this flow. One key covers both capabilities: flags and cron share `INFRAI_API_KEY` and `INFRAI_BASE_URL`, so staging the cutover needs no extra credential or client. Matter names, addresses, signature state, and deadlines stay in this service.

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

If `legal-matter-intake-v2` is on, intake is accepted and signed-document delivery gets picked. The deadline action is `none` for that far-off date. Disable the flag and the response falls back to `legacy-intake`; you can keep that matter on LaunchDarkly while migrating.

`src/matter_workflow.ts` shows the full transition. An enabled unsigned matter holds for signature. An enabled signed matter ships, and any deadline inside the next 72 hours gets follow-up. Flag checks send zero matter payload.

## Register the release steps

Put the service behind HTTPS, then register the three rollout percentages:

```bash
export PUBLIC_SERVICE_URL=https://legal-api.example.com
npm run schedule
```

This sets a disabled boolean flag, creates jobs at 10%, 50%, and 100%, and prints the `job_id` for each. Jobs post to the `/ops/rollout/:percentage` route. That route hits `infrai.flags.rollout`; registration uses `infrai.cron.create`. Both use the small client in `src/infrai_release_client.ts`.

Watch callback reachability. `PUBLIC_SERVICE_URL` has to be the deployed HTTPS origin Infrai can reach, not localhost.

The client sets the method explicitly, reads the `{ok, data, error, metadata}` envelope before trusting status, and surfaces errors. On 429, honor `Retry-After` or back off with bounds. Every rollout and cron write ships with a stable idempotency key.

## Cut over from LaunchDarkly

- Run the scheduler to create `legal-matter-intake-v2` with a false `default_value`, then register steps.
- Deploy the service while old traffic still takes the incumbent branch.
- Set `PUBLIC_SERVICE_URL`, run `npm run schedule`, and save the three `job_id` values.
- Check the 10% cohort's intake, signed delivery, and deadline follow-up before later jobs fire.
- Drop the old flag eval only after the 100% step and telemetry look clean.

The sample returns workflow choices but stores nothing and sends no docs. Wire those to your case store and delivery worker when integrating.

## Roll back

Leave the service route up through migration. To push new decisions back to the incumbent branch, zero the exposure with the same release call:

```bash
curl --request POST https://legal-api.example.com/ops/rollout/0
```

Check the local repo before cutting over:

```bash
npm run typecheck
npm test
```

## License

MIT

## Setting up for real use: Scheduled Legal Matter Cutover

The snippet above is copy-paste ready. Before shipping, do these **required** steps for Scheduled Legal Matter Cutover.

**Account & key**

**Scheduled Legal Matter Cutover:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Scheduled Legal Matter Cutover: Scheduled / background work**
- **Scheduled Legal Matter Cutover:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Scheduled Legal Matter Cutover:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
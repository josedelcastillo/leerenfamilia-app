# adapters

Everything that touches the outside world: DynamoDB, SSM Parameter Store, the WhatsApp provider,
Cognito. Adapters depend on `domain/`; `domain/` never depends on adapters.

Lands in phases 2–4:

- `dynamo.ts` — single-table access, entity key builders.
- `ssm.ts` — SecureString reads, cached in memory for the life of the execution environment.
- `whatsapp/` — the `WhatsAppProvider` interface with `MetaCloudProvider` and `MockProvider`
  behind it, selected by `WA_PROVIDER`.

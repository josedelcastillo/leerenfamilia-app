# domain

Pure business logic. **No AWS SDK imports, no network, no clock reads at module scope.**

Everything here must be unit-testable with `node --test` and no credentials. This is the layer the
pilot's indicators depend on, so it is the layer that gets serious coverage.

Lands in phase 2:

- `schedule.ts` — program week from `(anchor_date, today)`; see `docs/decisiones.md` D-003.
- `eligibility.ts` — whether a family is due a send this ISO week.
- `service-window.ts` — the 24h WhatsApp service window state per caregiver.
- `opt-in.ts` — opt-in / opt-out transitions and the keyword rules (`BAJA`, `STOP`, `SALIR`).
- `feedback.ts` — feedback state machine (`abierto` → `respondido` → `cerrado`).

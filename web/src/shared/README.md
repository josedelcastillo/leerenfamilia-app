# shared

Code used by both surfaces: API client, the family token stored in `localStorage`, formatting
helpers, and the IndexedDB sync queue (phase 5).

Nothing here may import from `app/` or `gestor/`; keeping the dependency arrow one-way is what
stops the manager bundle from being pulled into the family chunk.

# Database migrations

Incremental, ordered schema changes. Each file is applied **once**, in numeric order,
to bring a database up to date **without dropping data**.

- `schema.sql` (in the parent folder) builds the full schema from scratch (it DROPs and
  recreates every table — it destroys data, so use it only for a fresh/empty database).
- These migration files are the incremental changes applied *after* the initial build,
  as the schema evolves feature by feature.

## Applying a migration
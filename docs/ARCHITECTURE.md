# Architecture

```
Browser (SPA)                          Docker Container
+--------------------------+           +-------------------------+
| React + TypeScript + Vite|           | nginx (static SPA)      |
| Konva.js (canvas engine) |  ------>  | Node.js API             |
| Zustand (state)          |   save/   |   +- /data/stift.db     |
| Tailwind CSS             |   load    |   +- /data/users/...    |
+--------------------------+           +-------------------------+
  All image processing                   Encrypted blobs on disk
  happens here                           User records in SQLite
```

## Storage layout

User accounts and per-user quotas live in a single **SQLite** database at `/data/stift.db` (via `better-sqlite3`, WAL mode). Encrypted project payloads are *not* stored in the database; they remain as plain files under `/data/users/<username>/projects/<id>.json` and `/data/shared/<id>.json`.

This split is deliberate:

- **The DB stays small.** It holds only structured records (users, roles, quotas), so backups, replication, and inspection are trivial.
- **Big blobs stay as files.** Project payloads can be tens of MB each; putting them in SQLite would bloat the file and complicate backups. As files they can be served, copied, and rsync'd directly.
- **Deployment stays simple.** SQLite is a single file, no separate database process to run, configure, or back up. The whole `/data` directory is the unit of backup: one bind mount, one `tar`, done.

The `users` table:

| column               | type    | notes                                                  |
|----------------------|---------|--------------------------------------------------------|
| `username`           | TEXT PK | sanitized lowercase                                    |
| `auth_token`         | TEXT    | derived from password client-side, never the password  |
| `role`               | TEXT    | `user` or `admin`                                      |
| `max_projects`       | INTEGER | per-user quota (default from `MAX_PROJECTS_PER_USER`)  |
| `can_share_projects` | INTEGER | boolean, gates POST `/api/shared`                      |
| `created_at`         | TEXT    | ISO timestamp                                          |

The `invitations` table follows the same shape with `token`, `max_projects`, `can_share_projects`, `expires_at`, `consumed_at`, `consumed_by`, `created_at`.

The admin API (`PUT /api/admin/users/:username`) can mutate `role`, `maxProjects`, and `canShareProjects`. On first startup the server auto-imports any pre-existing `/data/users/*.json` files from older deployments and renames them to `*.migrated`.

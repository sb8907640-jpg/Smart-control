# Smart Control Node.js / Express Backend

This service is the production HTTP API layer for Smart Control. It is separate from the existing Firebase Functions service and does not replace or modify the Android application.

## Runtime

- Node.js 20+
- Express 5
- Firebase Admin SDK
- Helmet security headers
- CORS allow-list via `CORS_ORIGIN`
- Firebase ID-token verification with revoked-token checking
- Firestore-backed authenticated API reads

## Run

From `backend/`:

```bash
npm install
npm test
npm run check
npm start
```

Set `GOOGLE_APPLICATION_CREDENTIALS` or use the hosting platform's default Firebase service-account identity. Set `CORS_ORIGIN` to a comma-separated production allow-list and `PORT` when required.

## Verified API surface

- `GET /healthz`
- `GET /readyz`
- `GET /api/auth/session`
- `GET /api/system/status`
- `GET /api/plans`
- `GET /api/plans/:id`
- `GET /api/devices`
- `GET /api/subscription/status`

Sensitive device-control operations remain governed by the Android application's explicit permission/session boundaries. This service does not bypass OS permissions or create hidden access.

## PostgreSQL

The production data layer uses PostgreSQL through the `pg` connection pool. Set `DATABASE_URL` and, when required by the hosting environment, `PGSSL=true`. The initial schema is in `migrations/001_initial.sql`. CI runs the repository unit tests without requiring production credentials; deployment must supply the managed PostgreSQL connection securely.


## PostgreSQL production setup

Set `DATABASE_URL` to the managed PostgreSQL connection string. The service uses a bounded connection pool and TLS by default. Run `npm run migrate` during deployment before serving traffic. PostgreSQL health is exposed in the authenticated `/api/system/status` response and the service fails closed when a configured database is unavailable.

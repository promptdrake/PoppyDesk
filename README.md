# PoppyDesk Web

Vue 3 and TypeScript single-page app for the PoppyDesk shared team inbox. React components are embedded through Veaury, and Vite builds the production bundle.

- Frontend repository: <https://github.com/promptdrake/PoppyDesk>
- Backend repository: <https://github.com/promptdrake/PoppyDeskBackend>

## Requirements

- Node.js 20 or newer
- npm (a lockfile is committed, so use `npm ci`)

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `.env` (development only) | Backend base URL used by the Vite dev proxy for `/api` and `/api/ws` |

The development proxy is defined in `vite.config.ts`. Production builds do not use `VITE_API_PROXY_TARGET`; the backend host is fixed in the source and must match the domain you deploy to:

- `src/api.ts` — API base 
- `src/views/InboxView.vue` — WebSocket URL 

If you deploy on a different domain, update both constants before building.

## Local development

```sh
npm ci
cp .env.example .env
# set VITE_API_PROXY_TARGET to your running backend, e.g. http://localhost:18080
npm run dev
```

Open <http://localhost:5173>. On a fresh database, create the first owner at `/setup`; later visits use `/login` and employees use `/signup`.

The dev server proxies `/api` (HTTP) and `/api/ws` (WebSocket) to `VITE_API_PROXY_TARGET`, so the browser sees one origin and session cookies work normally.

## Production build

```sh
npm ci
npm run build
```

The static site is written to `dist/`. Preview it with `npm run preview`.

## Deployment

### Recommended: serve the app and API on one HTTPS domain

Serve `dist/` as static files and reverse-proxy `/api` and `/api/ws` to the Go backend on the **same host**. This is required for the current authentication model: the session cookie is host-scoped, so the web app and the API must share the exact hostname. It also lets the WebSocket upgrade authenticate with that cookie.

1. Build the site (`npm run build`).
2. Upload the contents of `dist/` to the web root, for example `/var/www/poppydesk`.
3. Configure nginx to serve the SPA and proxy the API, including WebSocket upgrades. A complete example is in the backend README: <https://github.com/promptdrake/PoppyDeskBackend>.
4. On the backend, set `CORS_ORIGIN` to the exact site origin (for example `https://inbox.example.com`) and `COOKIE_SECURE=true`.
5. Verify `/api/health` and confirm the inbox shows live updates (the sidebar must not show "Live updates paused").

The production constants in `src/api.ts` and `src/views/InboxView.vue` must reference the host you serve, or use the same host as the site. For example, if the site is served at `https://inbox.example.com`, the API base should be `https://inbox.example.com` and the WebSocket `wss://inbox.example.com/api/ws`.

### Hosting on Vercel or another static host

The included `vercel.json` rewrites `/api/*` to the backend, which works for REST requests. It does **not** proxy WebSocket upgrades. Because the app opens the WebSocket directly against the backend host while the session cookie belongs to the site's host, live updates cannot authenticate when the frontend and backend are on different hostnames.

Use static hosting only if you also terminate the WebSocket and API on the site's own host (a reverse proxy on a custom domain). Otherwise host the built site together with the API as described above.

## Project layout

- `src/views/` — inbox, channels, team, settings, and auth screens
- `src/components/` — shared UI components
- `src/api.ts` — fetch client for the backend API
- `src/session.ts` — session bootstrap and auth state
- `src/router.ts` — routes and role guards

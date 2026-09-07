# Speculus

Speculus is the Orbis-launched character and roleplay simulator for The Howling Whispers. It is hosted as a separate service, but it has no normal standalone loading flow.

The user selects a character, world, place, item, faction, or other record in Orbis and clicks **Simulate**. Orbis boxes the selected record, its connected context, the active persona, relationship state, and a temporary generation grant into a versioned launch package. Speculus claims that package once and boots directly into the simulation.

A direct visit without an active package deliberately produces a 1982-style missing-system-medium error.

## Security boundary

- NovelAI credentials are entered and managed only in Orbis.
- Speculus never receives the raw NovelAI token.
- Ollama and provider selection are not part of Speculus.
- Orbis sends a short-lived opaque generation grant in the server-to-server launch package.
- Speculus seals that grant inside an HTTP-only server session and sends generation requests to the shared Orbis API.
- Browser diagnostics expose safe provider metadata only.

## Start locally

```bash
npm install
npm run dev:api
npm run dev
```

Open `http://localhost:5175`. Without a launch package, the terminal correctly halts with `BOOT FAILURE: SIMULATION PACKAGE NOT FOUND`.

## Orbis launch exchange

Orbis sends a server-to-server `POST /api/launch` with:

```http
Authorization: Bearer <SPECULUS_BRIDGE_SECRET>
Content-Type: application/json
```

The version 1 package contains the primary asset, related records, optional character card, active persona, scene, context blocks, relationship state, selected model, expiry, and an opaque generation grant. The response contains a one-time `launchUrl` that Orbis opens for the user.

The browser claims that package once. Speculus removes the launch code from the address bar, creates an HTTP-only generation session, and stores only the non-secret simulation state in tab-scoped `sessionStorage`.

## Environment

Copy `.env.example` to the protected service environment:

```env
PORT=8790
SPECULUS_PUBLIC_ORIGIN=https://spec.thehowlingwhispers.com
SPECULUS_BRIDGE_SECRET=<shared server-to-server secret>
ORBIS_GENERATION_API_URL=http://127.0.0.1:8789/api/v1/generation/speculus
```

`SPECULUS_BRIDGE_SECRET` authorizes Orbis to deposit launch packages. It is not a NovelAI token. `ORBIS_GENERATION_API_URL` must point to the internal shared generation gateway.

## Commands

```bash
npm test
npm run lint
npm run build
npm run start:api
```

The complete boundary is recorded in [`docs/architecture.md`](docs/architecture.md).

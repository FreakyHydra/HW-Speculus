# Speculus

Speculus is a standalone character and roleplay test bench styled as a mysterious 1982 field terminal. Load one Character Card V2 subject, load or create a persona, define a scene, run roleplay turns, and inspect exactly what the runtime sent and inferred.

Phase 1 deliberately excludes accounts, Discord, multiplayer, World Forge, Fabula, and Library integration.

## Start locally

```bash
npm install
npm run dev:api
npm run dev
```

Open `http://localhost:5175`. Vite proxies `/api` to the Express API on port `8790`.

The mock provider works without configuration. It is intended for deterministic UI and state testing.

## Providers

Copy `.env.example` to `.env` for server configuration. Never commit `.env`.

- NovelAI-compatible: set `NOVELAI_TOKEN` on the API server, or enter an ephemeral token in the UI. It is sent for the current request and never stored.
- Ollama: set `OLLAMA_BASE_URL`, or enter a reachable URL in the UI. The default is `http://127.0.0.1:11434` from the API server.

## Commands

```bash
npm test
npm run lint
npm run build
npm run start:api
```

The architecture and source-port decisions are recorded in [`docs/architecture.md`](docs/architecture.md).

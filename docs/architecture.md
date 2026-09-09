# Speculus Phase 1 Architecture

## Research baseline

This plan was written before implementation after inspecting:

- `HowlingWhispers/HW-Library` `dev` at `05bd0ba35fb41487eedf7cae54cefa617244bd4a` for its Vite, React, TypeScript, Express, and Vitest project shape.
- `HowlingWhispers/HW-Library` `dev` at `e92df3da0772cd0aa852d2efdc70638c8ee8164b` for context compilation, perception, player-turn formatting, cast resolution, autonomy boundaries, world time, prose rules, relationship event recomputation, storage, and provider request handling.

Speculus is separately deployed, but it is not a standalone user destination. Orbis is the only normal launch surface. A direct visit contains no simulation package and deliberately halts like a 1982 terminal with no system medium.

## Boundaries

```text
Orbis item + user settings
      |
      v
One-time launch package -----> Speculus HTTP-only bridge session
                                      |
                                      v
React terminal UI -----> simulator runtime -----> Orbis shared generation API
                              |
                              +---- context compiler and perception
                              +---- relationship event recomputation
                              +---- diagnostics snapshot
```

The UI owns interaction and rendering. The simulator controller owns turn orchestration. Pure runtime modules own interpretation, compilation, formatting, and state transitions. Orbis owns assets, user identity, personas, and NovelAI credentials. Speculus receives an immutable, versioned snapshot plus a short-lived opaque generation grant. The raw NovelAI token never crosses the Speculus boundary.

## Ported

The following behavior is ported closely because it is already proven and has small, testable boundaries:

- The relationship score range, semantic tiers, `(characterId, personaId)` identity, stable `turnId` event replacement, deletion, and score recomputation from surviving events from `lib/relationships/schema.ts` and `core.ts`.
- The provider-neutral `RelationshipScorer` shape and conservative local scoring approach from `lib/relationships/evaluator.ts`.
- Character-output echo protection from `lib/generation/character-turn-boundary.ts`.
- The roleplay formatting contract and idempotent cleanup principles from `lib/generation/player-turn.ts` and `lib/generation/prose-quality.ts`.

## Adapted

The following behavior is reduced to the Phase 1 test-bench needs:

- `compile-context.ts` and `compile-context-core.ts`: adapted into a compact compiler for the Orbis-packaged primary asset, optional Character Card V2 subject, persona, scene, connected context blocks, relationship state, world clock, recent transcript, and prose policy. The compiler returns both the prompt and a readable manifest.
- `perception.ts`: adapted to report current scene facts, the active subject, persona point of view, and explicit filtering reasons without requiring the full location/world schema.
- `living-cast.ts`: adapted to deterministic active-subject resolution. Phase 1 has one primary imported subject, while mentioned names remain diagnostic mentions and do not become active characters.
- `world-clock.ts`: adapted to a session-relative clock with stable timestamps rather than the main application's Europe/Berlin world clock.
- `app/api/novelai/route.ts`: only its provider-neutral request boundary and safe metadata principles are adapted. Speculus forwards compiled generation requests through the authenticated Orbis shared API. It has no NovelAI or Ollama configuration.
- Character and persona parsing remains available for tests and Orbis-side package construction, but the production Speculus UI has no manual import controls.
- Persistence is tab-scoped. The safe package and simulator state can survive a refresh, while the generation grant remains only in an HTTP-only server session.
- The Orbis bridge deposits a version 1 package through authenticated server-to-server `POST /api/launch`. The one-time browser claim deletes the launch code and seals the generation grant in a private Speculus session.

## Deliberately not copied

- The Next.js application shell, `dreambound-app.tsx`, feature areas, routes, authentication, Discord, PostgreSQL, and deployment logic.
- World Forge, world lorebook editing, mature-content gating, accounts, multiplayer, archive management, and Fabula/free-roam behavior. Speculus consumes the package Orbis authored but does not edit Orbis records.
- Full Living Cast discovery, autonomous cast drives, world simulation V2, story metadata, impersonation, autopilot, and add-on systems.
- Direct NovelAI credentials, Ollama, provider selection, NovelAI streaming, long-response continuation loops, device-finalization workflows, and server generation queues.
- Any committed API token. Only non-secret provider metadata is persisted or exposed through diagnostics.

## Runtime transaction

For each submitted player turn, the controller creates stable player and character turn IDs. It runs perception and subject resolution, reads the relationship record, compiles context, calls exactly one adapter, cleans the reply, evaluates one relationship event keyed to the character turn ID, persists the resulting session, and records a diagnostics snapshot.

A reroll reuses the existing character turn ID and replaces both the transcript entry and its relationship event. Deleting that character turn removes the event and recomputes the relationship record from the remaining events. This makes the transcript the durable source of turn identity and the event list the reproducible source of relationship score.

## Phase 1 provider contract

```ts
interface ProviderAdapter {
  generate(request: {
    prompt: string;
    model: string;
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<{
    text: string;
    metadata: SafeProviderMetadata;
  }>;
}
```

The mock adapter exists only for deterministic automated tests. Production uses the Orbis bridge adapter. The browser sends no provider credential, and diagnostics expose only safe bridge metadata.

## Verification target

Vitest covers launch-package validation, expiry, secret redaction, compiler inputs, schema separation, active-subject resolution, formatting, stable relationship events, reroll replacement, deletion, provider isolation, persistence round-tripping, malformed imports, and an end-to-end mock turn. `npm test` and `npm run build` must both pass before Phase 1 is reported complete.

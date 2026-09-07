# Speculus Phase 1 Architecture

## Research baseline

This plan was written before implementation after inspecting:

- `FreakyHydra/HW-Library` `dev` at `05bd0ba35fb41487eedf7cae54cefa617244bd4a` for its Vite, React, TypeScript, Express, and Vitest project shape.
- `FreakyHydra/HowlingWhispers` `dev` at `e92df3da0772cd0aa852d2efdc70638c8ee8164b` for context compilation, perception, player-turn formatting, cast resolution, autonomy boundaries, world time, prose rules, relationship event recomputation, storage, and provider request handling.

Speculus is a new standalone application. It shares no runtime imports, database, authentication, or deployment coupling with either reference project.

## Boundaries

```text
React terminal UI
      |
      v
Simulator controller -----> local session repository
      |
      +-----> provider-neutral runtime pipeline
                    |
                    +---- perception and active subject resolution
                    +---- context compiler
                    +---- provider adapter
                    +---- relationship event recomputation
                    +---- diagnostics snapshot
                                  |
                                  v
                         Express provider proxy
```

The UI owns interaction and rendering. The simulator controller owns turn orchestration. Pure runtime modules own interpretation, compilation, formatting, and state transitions. Provider adapters receive a compiled prompt and return text plus safe metadata. They never receive or mutate the session object.

## Ported

The following behavior is ported closely because it is already proven and has small, testable boundaries:

- The relationship score range, semantic tiers, `(characterId, personaId)` identity, stable `turnId` event replacement, deletion, and score recomputation from surviving events from `lib/relationships/schema.ts` and `core.ts`.
- The provider-neutral `RelationshipScorer` shape and conservative local scoring approach from `lib/relationships/evaluator.ts`.
- Character-output echo protection from `lib/generation/character-turn-boundary.ts`.
- The roleplay formatting contract and idempotent cleanup principles from `lib/generation/player-turn.ts` and `lib/generation/prose-quality.ts`.

## Adapted

The following behavior is reduced to the Phase 1 test-bench needs:

- `compile-context.ts` and `compile-context-core.ts`: adapted into a compact compiler for one imported Character Card V2 subject, one persona, one editable scene, relationship state, world clock, recent transcript, and prose policy. The compiler returns both the prompt and a readable manifest.
- `perception.ts`: adapted to report current scene facts, the active subject, persona point of view, and explicit filtering reasons without requiring the full location/world schema.
- `living-cast.ts`: adapted to deterministic active-subject resolution. Phase 1 has one primary imported subject, while mentioned names remain diagnostic mentions and do not become active characters.
- `world-clock.ts`: adapted to a session-relative clock with stable timestamps rather than the main application's Europe/Berlin world clock.
- `app/api/novelai/route.ts`: adapted into small Express routes and provider adapters. NovelAI-compatible requests use a server-side environment token or an ephemeral request token. Ollama uses a configurable base URL and model. The browser never owns server session state.
- Character and persona parsing: adapted to accept Character Card V2 and a deliberately small HW-compatible persona subset, normalize each into distinct schemas, and produce readable validation errors.
- Persistence: adapted from separate HowlingWhispers stores into one versioned local Speculus session envelope. Provider secrets are excluded.

## Deliberately not copied

- The Next.js application shell, `dreambound-app.tsx`, feature areas, routes, authentication, Discord, PostgreSQL, and deployment logic.
- World Forge, world lorebook selection, mature-content gating, accounts, Library integration, multiplayer, archive management, and Fabula/free-roam behavior.
- Full Living Cast discovery, autonomous cast drives, world simulation V2, story metadata, impersonation, autopilot, and add-on systems.
- NovelAI streaming, long-response continuation loops, device-finalization workflows, and server generation queues. These are useful production concerns but would obscure the Phase 1 simulator boundary.
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

The mock adapter is always available for deterministic end-to-end testing. NovelAI-compatible and Ollama adapters are reached through Express so browser restrictions and secrets remain outside the runtime domain.

## Verification target

Vitest covers compiler inputs, schema separation, active-subject resolution, formatting, stable relationship events, reroll replacement, deletion, provider isolation, persistence round-tripping, malformed imports, and an end-to-end mock turn. `npm test` and `npm run build` must both pass before Phase 1 is reported complete.

# Speculus repository rules

- Work on `main`. Temporary feature branches are non-authoritative until merged into `main`.
- Keep Speculus standalone. Never add runtime imports from HW-Orbis, HW-Library, or the historical HowlingWhispers application.
- Keep React UI, simulator orchestration, pure runtime logic, storage, and provider transports separated.
- Speculus has no normal standalone entry flow. Production sessions arrive only through a one-time Orbis launch package.
- Provider adapters receive compiled prompts, never mutable session state.
- NovelAI credentials belong to the user's Orbis settings. Never request, receive, display, log, or persist the raw provider token in Speculus.
- Do not add Ollama or provider selection controls. Generation goes through the Orbis shared API.
- Stable character turn IDs own relationship events. Rerolls replace the event for that ID; deletion removes it.
- Preserve RP formatting: dialogue in double quotes, action/narration in single asterisks, inner voice in square brackets.
- Respect reduced motion and keep CRT effects readable.
- Phase 1 excludes accounts, Discord, multiplayer, World Forge, and Fabula. The narrow Orbis launch/generation bridge is the only allowed integration.
- Before completion run `npm test`, `npm run lint`, and `npm run build`.

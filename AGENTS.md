# Speculus repository rules

- Work on `dev` unless the user explicitly requests another branch.
- Keep Speculus standalone. Never add runtime imports from HW-Library or HowlingWhispers.
- Keep React UI, simulator orchestration, pure runtime logic, storage, and provider transports separated.
- Provider adapters receive compiled prompts, never mutable session state.
- Never commit provider tokens or persist them in local storage.
- Stable character turn IDs own relationship events. Rerolls replace the event for that ID; deletion removes it.
- Preserve RP formatting: dialogue in double quotes, action/narration in single asterisks, inner voice in square brackets.
- Respect reduced motion and keep CRT effects readable.
- Phase 1 excludes accounts, Discord, multiplayer, World Forge, Fabula, and Library integration.
- Before completion run `npm test`, `npm run lint`, and `npm run build`.

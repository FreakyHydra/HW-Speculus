# Speculus V2 foundation

Status: experimental, separate from the stable V1 application. This is the first
implementation slice, not a completed V2 simulation brain.

## Isolation contract

| Surface | V1 (unchanged behavior) | V2 |
| --- | --- | --- |
| Browser entry | `/` | `/v2` and `/v2/` |
| Entry module | `src/v1-entry.tsx` (former `src/main.tsx`, unchanged) | `src/v2/main.tsx` |
| Runtime/UI/styles | Existing modules | `src/v2/` |
| Launch deposit | `POST /api/launch`, package version 1 | `POST /api/v2/launch`, version 2, engine `v2` |
| One-time claim | `GET /api/launch/:code` | `GET /api/v2/launch/:code` |
| Generation | `POST /api/generate` | `POST /api/v2/generate` |
| Authorization | Existing V1 cookie | Launch-scoped `speculus_v2_*` cookies, HTTP-only, path `/api/v2` |
| Tab storage | `speculus.session.v1` | `speculus.session.v2` |
| Portable export | Existing V1 format | `speculus-v2-session`, version 2 |

The bootstrap imports only the selected engine. V1 DOM experiments and styles
are not installed in V2. There are no cross-engine session migrations. V1 exports
are rejected by V2 and V2 exports are rejected by V1.

Shared code is limited to immutable bridge schemas/types and the stateless
server-to-server provider transport. No runtime imports from the Orbis repository
exist. Orbis remains the only holder of the raw NovelAI token.

V2 authorization cookies are scoped to a launch ID so simultaneous V2 launches
cannot replace each other's authorization. Claims are one-time; replay, wrong
version, wrong cookie, wrong launch ID, wrong model and expired grants are rejected.
Claims and generation responses are not cacheable. Production cookies are Secure.

## Implemented

- Approved charcoal/ivory/teal research terminal with amber experimental status.
- Roleplay centre, collapsible setup/diagnostics, responsive stacking, optional
  scanlines, and reduced-motion support. No provider selector or token input.
- Native Orbis bridge parameters: output tokens, temperature, top K/P, presence
  and frequency penalties, custom stops and sentence-completion instruction.
- Output presets: Short 256, Normal 512, Long 1024, Marathon 2048 tokens. These are
  configurable application defaults, not subscription promises. They change
  output allowance only. Text is never sliced to a character quota locally.
- Typed physical state: explicit canonical scene anchor, actor presence,
  monotonically increasing elapsed seconds, actor-local known facts, revisions.
- Operator controls assert a scene/observation or advance time and record a world
  snapshot in the event ledger. They are explicit setup operations, not inferred
  gameplay movement. Unknown location/presence stays unknown.
- Separate bounded context compiler: source, subject, persona, scene, read-only
  engine state, actor-local knowledge, relevant available records, influences and
  up to four recent complete exchanges. Exact included/omitted lists are visible.
- Transactional generation: compile, generate, structural validation, commit.
  Provider adapters receive a prompt and settings, not mutable session state.
  Replies cannot write physical state. Failures/rejections/cancellation do not
  commit a reply or remove the draft.
- Latest-turn reroll keeps its stable ID and replaces its event. It is unavailable
  after an intervening world edit. Latest-turn deletion removes the pair/event.
- Raw export/import preserves settings, unsent draft, transcript, diagnostics,
  world and ledger without exporting launch authorization. Import requires the
  same source ID, type and canonical revision, with a fresh current launch.
- Expired local sessions can still be viewed and exported. A new launch is
  required to generate. Import never revives old authorization.

## Explicit limitations / next phases

1. **Semantic claims and action resolution:** current draft validation checks
   structure/control-token leakage, not every narrative assertion. Prose may still
   contradict canon; it cannot commit that contradiction to physical state. Add
   structured action proposals, trusted resolution and claim-level validation.
2. **Spacetime:** no movement graph, distances, line of sight, travel costs,
   body geometry or automatic turn duration yet. Do not label the operator controls
   as a finished physics engine.
3. **Cognition:** initial actor slots are the player and optional primary character.
   Related characters are not automatically present or autonomous. Goals,
   motivations and richer actor-local perception remain next-phase work.
4. **Memory:** explicit known facts and full transcript/events are retained; only
   recent exchanges enter the prompt. No semantic retrieval, summarization,
   relationship scoring, automatic episodic extraction or Director exists yet.
   The untouched launch package retains supplied relationship data for later use.
5. **Context:** 28,000-character prompt allowance, with `characters / 4` explicitly
   labelled as an estimate, not exact tokenizer accounting. Mandatory input that
   exceeds the allowance fails before a provider call; optional omissions are
   listed. Add exact per-model accounting and retrieval before long-session claims.
6. **Persistence:** tab-scoped browser state, not a new server session database.
   Browser quota limits still apply. Storage failures show an export warning.
   Raw imports are limited to 16 MB. Durable server-side V2 persistence and
   memory compaction remain future work.
7. **Cancellation:** cancels the browser request and prevents a client commit; the
   already-started shared upstream call may finish and incur provider usage.
8. **Verification:** deterministic tests and production builds are required.
   This change has not been tested against a live user NovelAI account. The cloud
   preview browser blocked localhost, so real-browser visual QA remains pending.

No Fabula inventory, economy, dice, world population or autonomous game systems
are introduced by this slice.

### Generation failure diagnostics

The shared server transport now recognizes safe Orbis failure codes and the
previous bridge's static error messages. It displays the NovelAI HTTP status,
known rejected parameter, output budget or empty-reply finish reason when supplied,
plus an Orbis request ID for log correlation. Unknown/HTML errors get a readable
fallback; raw upstream bodies are never shown. This applies to both engine routes
without changing successful generation requests. V2 also handles HTML gateway
responses from its own reverse proxy.

Deploy the matching Orbis API for the full error contract. No migration is needed
for this diagnostic fix. It resolves the hidden error details, not the still
unconfirmed underlying cause of the original generic HTTP 502 report. A live retry
and its request ID are needed to identify that provider failure.

## Rollout

1. Build and deploy this Speculus revision with existing bridge environment.
   Ensure the reverse proxy serves the SPA for `/v2` and forwards `/api/v2/*` to
   the Speculus API, as it already does for `/api/*`. Do not redirect `/v2` to `/`.
2. Apply Orbis migration `007_simulation_engine_settings.sql` and deploy its
   matching account-settings/launch changes. This is additive and does not edit
   worlds, characters, SPC records, provider credentials or existing sessions.
3. In Orbis Account settings, explicitly save **Speculus V2 · Experimental**, then
   use Simulate. No saved preference continues to mean V1.
4. Smoke-test V1 and V2 with separate browser tabs, verify output settings in the
   Context inspector, then test export/relaunch/import on a non-sensitive record.
5. To opt out, save V1 in Orbis. Existing V2 sessions are not converted or deleted.

Do not remove the settings table on rollback. Reverting the Orbis code simply
ignores it. Switch accounts back to V1 before rolling back the Speculus V2 API.

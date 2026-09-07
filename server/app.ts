import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { clientLaunchPackage, parseOrbisLaunchPackage } from '../src/runtime/schema/launch-package.js';
import type { OrbisLaunchPackage } from '../src/runtime/schema/types.js';
import { generateThroughOrbis, type GenerationSession } from './providers/provider-service.js';

const generationRequestSchema = z.object({
  provider: z.literal('orbis'),
  prompt: z.string().min(1).max(500_000),
  model: z.string().trim().min(1).max(200),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(32).max(4096),
  reroll: z.boolean().optional(),
});

const launchCodes = new Map<string, OrbisLaunchPackage>();
const generationSessions = new Map<string, GenerationSession>();

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearer(request: Request): string {
  return request.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

function cookie(request: Request, name: string): string {
  const pair = (request.get('cookie') ?? '').split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, value] of launchCodes) if (value.expiresAt <= now) launchCodes.delete(key);
  for (const [key, value] of generationSessions) if (value.expiresAt <= now) generationSessions.delete(key);
}

export function createApp(options: { production?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'speculus-api', launchBridge: true }));

  app.post('/api/launch', (request, response, next) => {
    try {
      const bridgeSecret = process.env.SPECULUS_BRIDGE_SECRET ?? '';
      if (!bridgeSecret || !equalSecret(bearer(request), bridgeSecret)) return response.status(401).json({ error: 'Orbis bridge authorization failed.' });
      pruneExpired();
      const launchPackage = parseOrbisLaunchPackage(request.body);
      const code = randomUUID();
      launchCodes.set(code, launchPackage);
      const origin = (process.env.SPECULUS_PUBLIC_ORIGIN || 'https://spec.thehowlingwhispers.com').replace(/\/$/, '');
      response.status(201).json({ launchUrl: `${origin}/?launch=${encodeURIComponent(code)}`, expiresAt: launchPackage.expiresAt });
    } catch (error) { next(error); }
  });

  app.get('/api/launch/:code', (request, response) => {
    pruneExpired();
    const launchPackage = launchCodes.get(request.params.code);
    if (!launchPackage) return response.status(404).json({ error: 'Simulation package is missing, expired, or already claimed.' });
    launchCodes.delete(request.params.code);
    const sessionId = randomUUID();
    generationSessions.set(sessionId, {
      launchId: launchPackage.launchId,
      generationGrant: launchPackage.generationGrant,
      source: { id: launchPackage.primaryAsset.id, revision: launchPackage.primaryAsset.revision, type: launchPackage.primaryAsset.type },
      expiresAt: launchPackage.expiresAt,
    });
    const lifetime = Math.max(1, Math.floor((launchPackage.expiresAt - Date.now()) / 1000));
    response.setHeader('Set-Cookie', `speculus_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${lifetime}${options.production ? '; Secure' : ''}`);
    response.json({ package: clientLaunchPackage(launchPackage) });
  });

  app.post('/api/generate', async (request, response, next) => {
    try {
      pruneExpired();
      const session = generationSessions.get(cookie(request, 'speculus_session'));
      if (!session) return response.status(401).json({ error: 'No active Orbis simulation authorization. Launch the item again.' });
      const body = generationRequestSchema.parse(request.body);
      response.json(await generateThroughOrbis(session, body));
    } catch (error) { next(error); }
  });

  if (options.production) {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const webRoot = path.resolve(directory, '../../dist');
    app.use(express.static(webRoot, { index: false, maxAge: '1h' }));
    app.get('*splat', (_request, response) => response.sendFile(path.join(webRoot, 'index.html')));
  }
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return response.status(400).json({ error: error.issues[0]?.message ?? 'Invalid request.' });
    const message = error instanceof Error ? error.message : 'Speculus bridge request failed.';
    response.status(502).json({ error: message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]') });
  });
  return app;
}

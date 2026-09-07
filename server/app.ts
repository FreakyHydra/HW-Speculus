import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { generateWithProvider } from './providers/provider-service.js';

const requestSchema = z.object({
  provider: z.enum(['novelai', 'ollama']),
  prompt: z.string().min(1).max(500_000),
  model: z.string().trim().min(1).max(160),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(32).max(4096),
  baseUrl: z.string().url().max(500).optional().or(z.literal('')),
  apiToken: z.string().max(8192).optional(),
  reroll: z.boolean().optional(),
});

export function createApp(options: { production?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '768kb' }));
  app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'speculus-api' }));
  app.post('/api/generate', async (request, response, next) => {
    try {
      const body = requestSchema.parse(request.body);
      const result = await generateWithProvider(body.provider, body);
      response.json(result);
    } catch (error) { next(error); }
  });
  if (options.production) {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const webRoot = path.resolve(directory, '../../dist');
    app.use(express.static(webRoot, { index: false, maxAge: '1h' }));
    app.get('*splat', (_request, response) => response.sendFile(path.join(webRoot, 'index.html')));
  }
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return response.status(400).json({ error: error.issues[0]?.message ?? 'Invalid provider request.' });
    const message = error instanceof Error ? error.message : 'Provider request failed.';
    response.status(502).json({ error: message.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]') });
  });
  return app;
}

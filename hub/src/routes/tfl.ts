import { Router } from 'express';
import * as tflArrivals from '../tflArrivals.js';

export const tflRouter = Router();

// Backs AddTflArrivalsDialog's station search box — see tflArrivals.ts's
// searchStations() for the hub/interchange -> real-station resolution this does
// server-side.
tflRouter.get('/stations/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ error: 'q is required' });
  try {
    const results = await tflArrivals.searchStations(q);
    res.json(results);
  } catch (err) {
    console.error('[tfl] station search failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'TfL station search failed' });
  }
});

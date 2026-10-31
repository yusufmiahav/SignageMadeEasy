import { Router } from 'express';
import { checkPin, clearSessionCookie, isAuthenticated, setSessionCookie } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { pin } = req.body ?? {};
  if (typeof pin !== 'string' || !checkPin(pin)) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }
  setSessionCookie(res);
  res.status(204).end();
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/status', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { DATA_DIR } from './db.js';

// A single shared PIN gate, not per-user accounts — this is a small LAN control
// panel, not a multi-tenant system. Defaults to a known value ("Abc123") so a fresh
// hub is usable immediately without a setup step; see hub/README.md for how to
// change it via the SIGNAGE_PIN environment variable. This only protects the
// management API (library/groups/devices/scan/backup) — the Pi-facing endpoints
// (player state, heartbeat) have no login flow and stay open, same as before.
function configuredPin(): string {
  return process.env.SIGNAGE_PIN ?? 'Abc123';
}

const SECRET_PATH = path.join(DATA_DIR, '.session-secret');
const COOKIE_NAME = 'signage_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cachedSecret: string | null = null;

// Persisted to disk (not regenerated per-process) so restarting the hub container —
// a completely routine occurrence for a Docker deployment — doesn't silently log
// everyone out.
function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  try {
    cachedSecret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
  } catch {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_PATH, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

function sign(value: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
}

function issueToken(): string {
  const payload = `${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);
  // Constant-time compare — this is a shared-secret auth token, not something worth
  // leaking timing information about.
  if (expected.length !== signature.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  const issuedAt = Number(payload);
  return Number.isFinite(issuedAt) && Date.now() - issuedAt < SESSION_MAX_AGE_MS;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function checkPin(pin: string): boolean {
  return pin === configuredPin();
}

export function setSessionCookie(res: Response): void {
  res.cookie(COOKIE_NAME, issueToken(), { httpOnly: true, sameSite: 'lax', maxAge: SESSION_MAX_AGE_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

export function isAuthenticated(req: Request): boolean {
  return isValidToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

import { Router } from 'express';
import os from 'node:os';
import * as piAgent from '../piAgent.js';
import * as store from '../store.js';
import type { DiscoveredDevice } from '../types.js';

export const scanRouter = Router();

function localSubnets(): string[] {
  const nets = os.networkInterfaces();
  const subnets = new Set<string>();
  for (const iface of Object.values(nets)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        subnets.add(addr.address.split('.').slice(0, 3).join('.'));
      }
    }
  }
  return [...subnets];
}

// Pulls a `a.b.c` /24 prefix out of whatever the pairing dialog's "hub address for
// this screen" field currently holds — a full URL (http://10.21.1.140:4000), a bare
// host (10.21.1.140), or already just a prefix. Returns null for anything that isn't
// a dotted-quad-shaped host (a domain name, an unparseable string) — there's no
// subnet to derive from those, so the hint is just dropped rather than erroring.
export function subnetHintFromHost(input: string): string | null {
  let host = input.trim();
  try {
    host = new URL(input).hostname;
  } catch {
    // Not a full URL — treat the whole trimmed input as the host itself (matches a
    // bare IP or IP:port typed directly into the field).
    host = host.split(':')[0];
  }
  const octets = host.split('.');
  if (octets.length < 3 || !octets.slice(0, 3).every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) return null;
  return octets.slice(0, 3).join('.');
}

/**
 * Probes every host on the hub's own /24 subnet(s) for an unpaired Pi agent, plus an
 * optional `?subnet=` hint (a `a.b.c` prefix, or a full hub-address URL/IP to derive
 * one from) — the hub's own network interfaces cover most setups already, but a
 * genuinely multi-homed hub or a remote-pairing session benefits from scanning
 * whichever network the person pairing just told the system about (see
 * PairDeviceDialog.tsx's "Hub address for this screen" field), even if that isn't
 * one of the hub's own directly-attached interfaces. Requires the hub container to
 * run with network_mode: host (see hub/README.md) for its own subnets to match the
 * physical LAN at all — on a bridged Docker network only an explicit `subnet` hint
 * has any chance of finding real devices.
 */
scanRouter.get('/', async (req, res) => {
  const alreadyPaired = new Set(store.listDevices().map((d) => d.ip));
  const subnets = new Set(localSubnets());
  const hint = typeof req.query.subnet === 'string' ? subnetHintFromHost(req.query.subnet) : null;
  if (hint) subnets.add(hint);
  if (subnets.size === 0) return res.json([]);

  const candidates = [...subnets].flatMap((prefix) =>
    Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`)
  ).filter((ip) => !alreadyPaired.has(ip));

  const CONCURRENCY = 32;
  const found: DiscoveredDevice[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const ip = candidates[cursor++];
      try {
        const identity = await piAgent.identify(ip, 1200);
        if (!identity.paired) found.push({ id: ip, name: identity.hostname, ip });
      } catch {
        // not a signage Pi, or unreachable — expected for almost every address
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  res.json(found);
});

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

/** Probes every host on the hub's own /24 subnet(s) for an unpaired Pi agent. Requires
 * the hub container to run with network_mode: host (see hub/README.md) — on a bridged
 * Docker network this subnet won't match the physical LAN and nothing will be found. */
scanRouter.get('/', async (_req, res) => {
  const alreadyPaired = new Set(store.listDevices().map((d) => d.ip));
  const subnets = localSubnets();
  if (subnets.length === 0) return res.json([]);

  const candidates = subnets.flatMap((prefix) =>
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

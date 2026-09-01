import os from 'node:os';

function activeInterface() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr;
    }
  }
  return null;
}

export function getLocalIp(): string | null {
  return activeInterface()?.address ?? null;
}

/** Reported to the hub once at pairing time (see agent.ts's /identify) — a MAC never changes the way a DHCP-assigned IP can, so it's a stable way to recognize "this is the same physical Pi" even after its IP moves. */
export function getLocalMac(): string | null {
  const mac = activeInterface()?.mac;
  return mac && mac !== '00:00:00:00:00:00' ? mac : null;
}

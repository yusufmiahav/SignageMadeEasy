import fs from 'node:fs';
import path from 'node:path';
import type { PairingConfig } from './types.js';

// Output 1's path is UNCHANGED from before dual-output existed — every
// single-output Pi (the overwhelming majority: every Pi 3B+, and any Pi 4/5/PC
// that wasn't provisioned with a second output) behaves exactly as it always has,
// reading/writing the exact same file it always did. Output 2 is a second,
// independent pairing — its own deviceId/hubUrl, own file — not a second field
// alongside output 1's; the two are otherwise-unrelated screens that happen to
// share a physical box (see hub/src/piAgent.ts's outputQuery and
// hub/src/types.ts's Device.outputIndex for the hub-side half of this).
const CONFIG_PATHS: Record<1 | 2, string> = {
  1: process.env.SIGNAGE_CONFIG_PATH ?? '/opt/signage/config.json',
  2: process.env.SIGNAGE_CONFIG_PATH_OUTPUT2 ?? '/opt/signage/config-output2.json',
};

const cached: Record<1 | 2, PairingConfig | null> = { 1: null, 2: null };
const loaded: Record<1 | 2, boolean> = { 1: false, 2: false };

export function loadConfig(output: 1 | 2 = 1): PairingConfig | null {
  if (loaded[output]) return cached[output];
  loaded[output] = true;
  try {
    cached[output] = JSON.parse(fs.readFileSync(CONFIG_PATHS[output], 'utf8')) as PairingConfig;
  } catch {
    cached[output] = null;
  }
  return cached[output];
}

export function saveConfig(config: PairingConfig, output: 1 | 2 = 1): void {
  const configPath = CONFIG_PATHS[output];
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  cached[output] = config;
  loaded[output] = true;
}

export function clearConfig(output: 1 | 2 = 1): void {
  try {
    fs.unlinkSync(CONFIG_PATHS[output]);
  } catch {
    // already gone
  }
  cached[output] = null;
  loaded[output] = true;
}

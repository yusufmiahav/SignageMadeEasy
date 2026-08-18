import fs from 'node:fs';
import path from 'node:path';
import type { PairingConfig } from './types.js';

const CONFIG_PATH = process.env.SIGNAGE_CONFIG_PATH ?? '/opt/signage/config.json';

let cached: PairingConfig | null = null;
let loaded = false;

export function loadConfig(): PairingConfig | null {
  if (loaded) return cached;
  loaded = true;
  try {
    cached = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as PairingConfig;
  } catch {
    cached = null;
  }
  return cached;
}

export function saveConfig(config: PairingConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  cached = config;
  loaded = true;
}

export function clearConfig(): void {
  try {
    fs.unlinkSync(CONFIG_PATH);
  } catch {
    // already gone
  }
  cached = null;
  loaded = true;
}

import { useCallback, useState } from 'react';

const ADVANCED_DEVICE_INFO_KEY = 'signagemadeeasy.advancedDeviceInfo';
const HIDE_ANNOUNCEMENT_ROW_KEY = 'signagemadeeasy.hideAnnouncementRow';

function initialBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function useStoredBool(key: string): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => initialBool(key));
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // Best-effort — the setting just won't persist across reloads if storage is unavailable.
      }
    },
    [key],
  );
  return [value, set];
}

/**
 * Per-browser display preferences for the Home screen's device cards, toggled from
 * Settings. Deliberately localStorage-only (not hub-backed) — matches useTheme's
 * precedent, since these are "how I like my own screen to look" choices rather than
 * shared fleet configuration.
 */
export function useUiSettings() {
  const [advancedDeviceInfo, setAdvancedDeviceInfo] = useStoredBool(ADVANCED_DEVICE_INFO_KEY);
  const [hideAnnouncementRow, setHideAnnouncementRow] = useStoredBool(HIDE_ANNOUNCEMENT_ROW_KEY);
  return { advancedDeviceInfo, setAdvancedDeviceInfo, hideAnnouncementRow, setHideAnnouncementRow };
}

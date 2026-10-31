// navigator.clipboard only exists in a secure context (HTTPS or localhost) — on this
// hub's normal deployment, plain http://<nas-ip>:4000 on the LAN, it's undefined
// entirely (confirmed directly: calling it there throws "Cannot read properties of
// undefined"), not just permission-denied. Falls back to the older
// document.execCommand('copy') via a temporary offscreen textarea, which still works
// without a secure context — deprecated, but there's no secure-context-free
// replacement, and this only needs to keep working until HTTPS is set up.
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

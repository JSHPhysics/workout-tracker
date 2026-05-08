// Share-or-clipboard primitive used by every share affordance in the
// app. On devices that expose `navigator.share`, opens the OS-native
// share sheet (WhatsApp / Discord / Snapchat / etc); falls back to
// copy-to-clipboard everywhere else, with one final `execCommand`
// fallback for ancient browsers.

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'error';

interface NavigatorWithShare {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
}

export async function shareText(input: {
  title?: string;
  text: string;
}): Promise<ShareOutcome> {
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as
    | (Navigator & NavigatorWithShare)
    | null;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({
        ...(input.title ? { title: input.title } : {}),
        text: input.text,
      });
      return 'shared';
    } catch (err) {
      // AbortError / NotAllowedError = user dismissed the share sheet
      // without picking a target. Treat as a normal cancel rather
      // than falling back to clipboard (which would silently copy
      // when they actually meant "don't share").
      if (
        err instanceof DOMException &&
        (err.name === 'AbortError' || err.name === 'NotAllowedError')
      ) {
        return 'cancelled';
      }
      // Some browsers expose `share` but reject for unexpected reasons
      // (e.g. too-long text on iOS). Fall through to the clipboard.
    }
  }
  try {
    await copyToClipboard(input.text);
    return 'copied';
  } catch {
    return 'error';
  }
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Last-ditch fallback for browsers without the Clipboard API.
  // execCommand is deprecated but works where the modern API doesn't.
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return;
  }
  throw new Error('No clipboard support available.');
}

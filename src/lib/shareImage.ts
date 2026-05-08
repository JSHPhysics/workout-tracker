// Companion to lib/shareText.ts but for image files. Tries
// `navigator.share({files})` (Android Chrome / iOS Safari 16.4+ /
// supported desktop), and falls back to triggering a PNG download
// everywhere else so desktop users still get something useful.

export type ImageShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'error';

interface NavigatorWithShare {
  share?: (data: {
    title?: string;
    text?: string;
    url?: string;
    files?: File[];
  }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

export async function shareImage(
  blob: Blob,
  filename: string,
  options: { title?: string; text?: string } = {},
): Promise<ImageShareOutcome> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as
    | (Navigator & NavigatorWithShare)
    | null;

  // navigator.share with a File requires both share() and canShare()
  // to exist AND canShare to confirm the file payload (Chrome / Safari
  // mobile typically yes, desktop typically no).
  const canShareFile =
    !!nav &&
    typeof nav.share === 'function' &&
    typeof nav.canShare === 'function' &&
    nav.canShare({ files: [file] });

  if (canShareFile) {
    try {
      await nav.share!({
        files: [file],
        ...(options.title ? { title: options.title } : {}),
        ...(options.text ? { text: options.text } : {}),
      });
      return 'shared';
    } catch (err) {
      // User dismissed the share sheet — treat as a cancel.
      if (
        err instanceof DOMException &&
        (err.name === 'AbortError' || err.name === 'NotAllowedError')
      ) {
        return 'cancelled';
      }
      // Fall through to download for unexpected failures.
    }
  }

  try {
    downloadBlob(blob, filename);
    return 'downloaded';
  } catch {
    return 'error';
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') {
    throw new Error('No document context for download.');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke async — give the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

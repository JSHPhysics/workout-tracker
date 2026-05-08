// Capture a chart's SVG as a PNG Blob. Used by chart share buttons on
// the Progress screen so the user can drop a chart image straight
// into WhatsApp / Discord / etc.
//
// Approach: serialize the rendered <svg> to a string, load it into
// an Image via an object URL, then draw it to a Canvas at retina
// scale. Works without any extra npm deps; relies on the SVG already
// having all its colours baked in as `rgb(...)` literals (which our
// `tk()` helper does — see Progress.tsx).
//
// Caveats:
// - Web fonts: the SVG inherits `font-family` from CSS. When loaded
//   into an <img> the canvas renderer falls back to system fonts for
//   text. Recharts axes use 9–14pt sans-serif so the result is close
//   enough; not pixel-perfect to the live chart but readable.
// - foreignObject elements would not render; Recharts doesn't use
//   them.

interface CaptureOptions {
  /** Background colour painted before drawing the SVG. Useful so the
   * chart has a proper backdrop in chat apps with arbitrary themes.
   * Default: 'transparent' (pass white explicitly when sharing). */
  background?: string;
  /** Pixels of padding around the chart on all sides. Default: 16. */
  padding?: number;
  /** Output scale multiplier. Default: window.devicePixelRatio (or 1). */
  scale?: number;
}

export async function captureSvgAsPng(
  containerEl: HTMLElement,
  options: CaptureOptions = {},
): Promise<Blob> {
  const svg = containerEl.querySelector('svg');
  if (!svg) throw new Error('No <svg> found inside chart container.');

  const rect = svg.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w === 0 || h === 0) {
    throw new Error('Chart SVG has zero dimensions — not yet rendered?');
  }

  // Clone the SVG so we don't mutate what's on screen. Stamp xmlns
  // and explicit width/height so the standalone serialization is
  // self-contained.
  const cloned = svg.cloneNode(true) as SVGElement;
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cloned.setAttribute('width', String(w));
  cloned.setAttribute('height', String(h));

  const svgString = new XMLSerializer().serializeToString(cloned);
  const svgBlob = new Blob([svgString], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG into <img>.'));
      img.src = url;
    });

    const scale = options.scale ?? window.devicePixelRatio ?? 1;
    const padding = options.padding ?? 16;
    const cssWidth = w + padding * 2;
    const cssHeight = h + padding * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(cssWidth * scale);
    canvas.height = Math.ceil(cssHeight * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas context available.');

    ctx.scale(scale, scale);
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    }
    ctx.drawImage(img, padding, padding, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null.'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

"""Generate PWA + Apple-touch icons from the brand barbell mark.

Run via:
    python scripts/build-icons.py

Outputs:
    public/pwa-192x192.png
    public/pwa-512x512.png
    public/pwa-maskable-512x512.png  (with safe-zone padding)
    public/apple-touch-icon.png      (180x180, iOS home screen)

Hand-coded with PIL so the build pipeline doesn't need a Node image
library — keeps the runtime deps Vite + plugins only.
"""

from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parents[1] / "public"

# Brand palette (matches favicon.svg + index.css token defaults).
BG = (12, 10, 8)        # near-black, --bg dark
PLATE = (34, 197, 94)   # joshua green, --accent
SLEEVE = (251, 113, 133)  # hayley coral

def render(size: int, *, maskable: bool = False) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)

    # Reserve a maskable safe zone (10% padding all sides).
    s = size * 0.8 if maskable else size
    inset = (size - s) / 2

    # Coordinates within a 64x64 logical canvas, scaled.
    def x(v: float) -> float:
        return inset + (v / 64) * s

    def y(v: float) -> float:
        return inset + (v / 64) * s

    radius = s * (14 / 64)
    if not maskable:
        # Rounded background tile (only matters for non-maskable; mask
        # icons get clipped to a rounded square by the OS).
        d.rounded_rectangle(
            (inset, inset, inset + s, inset + s),
            radius=radius,
            fill=BG,
        )

    # Two plates (rectangles).
    d.rounded_rectangle(
        (x(14), y(26), x(20), y(38)),
        radius=s * 0.01,
        fill=PLATE,
    )
    d.rounded_rectangle(
        (x(44), y(26), x(50), y(38)),
        radius=s * 0.01,
        fill=PLATE,
    )

    # Bar / sleeve.
    d.rounded_rectangle(
        (x(20), y(29), x(44), y(35)),
        radius=s * 0.018,
        fill=SLEEVE,
    )

    return img


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    targets = [
        ("pwa-192x192.png", 192, False),
        ("pwa-512x512.png", 512, False),
        ("pwa-maskable-512x512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]
    for name, size, maskable in targets:
        img = render(size, maskable=maskable)
        out = PUBLIC / name
        img.save(out, format="PNG", optimize=True)
        print(f"wrote {out.relative_to(PUBLIC.parent)} ({size}x{size}{' maskable' if maskable else ''})")


if __name__ == "__main__":
    main()

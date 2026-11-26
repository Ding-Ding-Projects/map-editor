"""Draws the app icon (the same mark as src/ui/favicon.svg) and writes assets/icon.ico and assets/icon.png.

Run: python3 scripts/make-icon.py   (needs Pillow). The results are committed, so builds do not need Python.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SIZES = [16, 24, 32, 48, 64, 128, 256]


def mark(size: int) -> Image.Image:
    scale = 8  # draw large, then shrink, for smooth edges
    s = size * scale
    u = s / 64
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=16 * u, fill="#2E6B2C")
    for x, y, fill in [(12, 12, "#AFF4A6"), (34, 12, "#FFFFFF"), (12, 34, "#FFFFFF"), (34, 34, "#BCEBF2")]:
        d.rounded_rectangle([x * u, y * u, (x + 18) * u, (y + 18) * u], radius=5 * u, fill=fill)
    return im.resize((size, size), Image.LANCZOS)


def main() -> None:
    out = ROOT / "assets"
    out.mkdir(exist_ok=True)
    big = mark(256)
    big.save(out / "icon.png")
    big.save(out / "icon.ico", sizes=[(n, n) for n in SIZES], append_images=[mark(n) for n in SIZES[:-1]])
    print(f"wrote {out / 'icon.ico'} ({', '.join(str(n) for n in SIZES)} px) and {out / 'icon.png'}")


if __name__ == "__main__":
    main()

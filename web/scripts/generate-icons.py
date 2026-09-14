"""
Generates the PWA icons from the Leer en Familia lockup, on the white brand ground.

The artwork is placed as delivered: scaled to fit, never cropped, recoloured or rotated (handoff).
At 32px and 192px the lockup is small; a vector mark made for launcher sizes is still pending from
Leer en Familia and stays listed in the runbook (D-022).

    python3 web/scripts/generate-icons.py
"""
from PIL import Image

SOURCE = "docs/diseno/handoff-2026-09/assets/lockup-vertical.png"
BACKGROUND = (255, 255, 255, 255)  # --paper
OUT = "web/public"

art = Image.open(SOURCE).convert("RGBA")


def icon(size: int, safe_ratio: float) -> Image.Image:
    """safe_ratio is the share of the canvas the artwork may occupy; maskable icons use the inner 80%."""
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    box = int(size * safe_ratio)
    scale = min(box / art.width, box / art.height)
    w, h = max(1, round(art.width * scale)), max(1, round(art.height * scale))
    resized = art.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - w) // 2, (size - h) // 2))
    return canvas.convert("RGB")


for size in (192, 512):
    icon(size, 0.92).save(f"{OUT}/icon-{size}.png", optimize=True)
    icon(size, 0.72).save(f"{OUT}/icon-maskable-{size}.png", optimize=True)
icon(180, 0.86).save(f"{OUT}/apple-touch-icon.png", optimize=True)
icon(32, 1.0).save(f"{OUT}/favicon-32.png", optimize=True)

print(f"Wrote icons from {SOURCE} to {OUT}/")

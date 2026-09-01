"""
Generates PLACEHOLDER app icons.

TODO: ícono real pendiente de Leer en Familia. This draws a neutral open-book mark so the PWA is
installable and passes icon validation; it is not the organisation's logo and must be replaced
before anything reaches a family.

    python3 web/scripts/generate-icons.py
"""
from PIL import Image, ImageDraw

BACKGROUND = (13, 71, 84)   # deep teal, also the manifest theme colour
INK = (255, 255, 255)
OUT = "web/public"


def draw_book(size: int, safe_ratio: float) -> Image.Image:
    """safe_ratio 1.0 fills the canvas; maskable icons keep the mark inside the inner 80%."""
    scale = 4  # supersample, then downscale, so the diagonals are not jagged
    canvas = Image.new("RGBA", (size * scale, size * scale), (*BACKGROUND, 255))
    draw = ImageDraw.Draw(canvas)
    s = size * scale
    m = s * (1 - safe_ratio) / 2          # margin imposed by the safe zone
    w = s - 2 * m

    spine_x = m + w / 2
    top = m + w * 0.24
    bottom = m + w * 0.78
    left = m + w * 0.10
    right = m + w * 0.90
    lift = w * 0.10                        # how much the outer edges curl up

    # Two facing pages meeting at the spine.
    draw.polygon(
        [(spine_x, top), (left, top + lift), (left, bottom), (spine_x, bottom - lift * 0.4)],
        fill=(*INK, 255),
    )
    draw.polygon(
        [(spine_x, top), (right, top + lift), (right, bottom), (spine_x, bottom - lift * 0.4)],
        fill=(*INK, 255),
    )
    # The spine itself, cut back out.
    draw.line([(spine_x, top), (spine_x, bottom - lift * 0.4)], fill=(*BACKGROUND, 255),
              width=max(2, int(w * 0.035)))

    return canvas.resize((size, size), Image.LANCZOS).convert("RGB")


for size in (192, 512):
    draw_book(size, 1.0).save(f"{OUT}/icon-{size}.png")

# Maskable: the mark stays inside the inner 80%, so no launcher shape can crop it.
for size in (192, 512):
    draw_book(size, 0.80).save(f"{OUT}/icon-maskable-{size}.png")

draw_book(180, 0.92).save(f"{OUT}/apple-touch-icon.png")
draw_book(32, 1.0).save(f"{OUT}/favicon-32.png")

print(f"Wrote placeholder icons to {OUT}/")

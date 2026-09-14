"""
Ships the Leer en Familia brand artwork at twice its largest on-screen size.

The originals in docs/diseno/handoff-2026-09/assets are 1200-1400px wide and 180-220 KB each; the app
shows them at 168px and 132px. The service worker precaches every PNG, so shipping the originals would
put ~700 KB on every family's phone for nothing. Resizing is not cropping or recolouring, which the
handoff forbids: the artwork is untouched, only its pixel count changes.

    python3 web/scripts/redimensionar-marca.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("docs/diseno/handoff-2026-09/assets")
OUT = Path("web/public/marca")

# Width in CSS px of the largest place each asset appears, times two for high-density screens.
TARGETS = {
    "lockup-horizontal.png": 168 * 2,  # activation screen (168px) and manager sidebar (156px)
    "mishashos.png": 132 * 2,          # progress screen
}

OUT.mkdir(parents=True, exist_ok=True)
for name, width in TARGETS.items():
    image = Image.open(SRC / name)
    height = round(image.height * width / image.width)
    image.resize((width, height), Image.LANCZOS).save(OUT / name, optimize=True)
    print(f"{name}: {image.width}x{image.height} -> {width}x{height}")

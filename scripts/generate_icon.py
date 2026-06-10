"""One-off icon generator for BPM Color Flash."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1]
SIZE = 256


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (10, 10, 15, 255))
    draw = ImageDraw.Draw(img)

    cx, cy = SIZE // 2, SIZE // 2
    rings = [
        (100, (239, 68, 68, 230)),
        (78, (34, 197, 94, 210)),
        (56, (59, 130, 246, 190)),
        (34, (234, 179, 8, 170)),
    ]
    for radius, color in rings:
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)

    # Phone silhouette
    draw.rounded_rectangle((108, 72, 148, 184), radius=10, fill=(20, 20, 28, 255), outline=(245, 245, 250, 200), width=4)
    draw.rounded_rectangle((116, 88, 140, 156), radius=4, fill=(255, 255, 255, 40))

    png = OUT / "icon.png"
    ico = OUT / "favicon.ico"
    img.save(png)
    img.save(ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"Wrote {png} and {ico}")


if __name__ == "__main__":
    main()

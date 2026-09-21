"""
Frames -> GIF, with per-frame durations.

Reads a manifest so each captured state can be held for a readable length of
time (a menu that appears for 40ms is useless in a demo), then quantises every
frame against one shared palette so the whole GIF stays stable instead of
flickering between per-frame palettes.

Usage: python make-gif.py <manifest.json> <out.gif>

manifest.json: {"width": int|null, "frames": [{"file": "...", "ms": 900}, ...]}
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# Classic arrow outline, drawn rather than shipped as an asset so the GIF
# pipeline has no binary dependencies. Points are relative to the hotspot.
CURSOR = [(0, 0), (0, 16), (4, 12), (7, 18), (10, 17), (7, 11), (12, 11)]


def draw_cursor(img: Image.Image, x: int, y: int, click: bool) -> Image.Image:
    """Screenshots taken over CDP contain no pointer, so the demo has to supply
    one or the viewer cannot tell what is being clicked."""
    layer = img.convert("RGBA")
    draw = ImageDraw.Draw(layer, "RGBA")

    if click:
        # A ring at the moment of the click, so the action reads as deliberate.
        for radius, alpha in ((22, 60), (15, 110)):
            draw.ellipse(
                [x - radius, y - radius, x + radius, y + radius],
                outline=(255, 255, 255, alpha),
                width=2,
            )

    shape = [(x + dx, y + dy) for dx, dy in CURSOR]
    draw.polygon(shape, fill=(255, 255, 255, 240), outline=(0, 0, 0, 220))
    return layer.convert("RGB")


def load_frames(manifest, base: Path):
    frames, durations = [], []
    for entry in manifest["frames"]:
        img = Image.open(base / entry["file"]).convert("RGB")
        cursor = entry.get("cursor")
        if cursor:
            img = draw_cursor(
                img, int(cursor["x"]), int(cursor["y"]), bool(cursor.get("click"))
            )
        frames.append(img)
        durations.append(int(entry.get("ms", 800)))
    return frames, durations


def resize(frames, width):
    if not width:
        return frames
    out = []
    for img in frames:
        if img.width == width:
            out.append(img)
            continue
        height = round(img.height * width / img.width)
        out.append(img.resize((width, height), Image.LANCZOS))
    return out


def build_shared_palette(frames, colors):
    """One palette for every frame: screenshots of the same UI share most colours,
    and a single palette avoids the frame-to-frame colour shimmer you get from
    per-frame quantisation."""
    if len(frames) == 1:
        sample = frames[0]
    else:
        # Stack a strip of all frames so the palette is chosen from the whole clip.
        total_h = sum(f.height for f in frames)
        sample = Image.new("RGB", (frames[0].width, total_h))
        y = 0
        for f in frames:
            sample.paste(f, (0, y))
            y += f.height
    return sample.quantize(colors=colors, method=Image.MEDIANCUT)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 1

    manifest_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))

    base = manifest_path.parent
    frames, durations = load_frames(manifest, base)
    frames = resize(frames, manifest.get("width"))

    colors = int(manifest.get("colors", 128))
    palette_source = build_shared_palette(frames, colors)
    quantised = [f.quantize(palette=palette_source, dither=Image.FLOYDSTEINBERG) for f in frames]

    quantised[0].save(
        out_path,
        save_all=True,
        append_images=quantised[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )

    size_kb = out_path.stat().st_size / 1024
    print(
        f"{out_path.name}: {len(quantised)} frames, "
        f"{quantised[0].width}x{quantised[0].height}, "
        f"{colors} colours, {sum(durations)/1000:.1f}s, {size_kb:.0f} KB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Resize a photograph for the website and strip what should not travel with it.

    python3 scripts/clean_image.py <source> <destination> [--max-px 1920] [--quality 82]

Originals live in the private asb-group-images repository; what lands here is
a web-sized copy with its metadata removed. This is the same treatment the
sync in asb-website-data gives member photographs (save_clean_jpeg), at a
larger size, because a page banner is displayed across the content column
rather than in a 160px circle.

What it does, and why in this order:

  exif_transpose first  A phone records orientation as a tag rather than by
                        rotating the pixels. Strip the metadata before acting
                        on it and the picture comes out on its side.
  convert to RGB        Drops any alpha channel, which JPEG cannot hold.
  thumbnail             Scales down only; a small original is never enlarged.
  info.clear()          Pillow carries the JPEG comment segment in .info and
                        would write it back out. This is what removes the
                        camera make, model, lens, timestamps and any GPS.
  progressive           A large photograph appears in passes rather than
                        loading top to bottom.
"""

import argparse
import os
import sys

from PIL import Image, ImageOps


def clean(source, destination, max_px=1920, quality=82):
    img = Image.open(source)
    before = img.size
    exif_count = len(img.getexif())

    img = ImageOps.exif_transpose(img)          # bake orientation in, first
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        flat = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(flat, img)
    img = img.convert("RGB")

    if max_px:
        img.thumbnail((max_px, max_px), Image.LANCZOS)

    img.info.clear()                            # the metadata goes here
    img.save(destination, "JPEG", quality=quality, optimize=True, progressive=True)

    return before, img.size, exif_count


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("destination")
    ap.add_argument("--max-px", type=int, default=1920,
                    help="longest edge in pixels (default 1920, the size of the front page hero)")
    ap.add_argument("--quality", type=int, default=82)
    args = ap.parse_args()

    before, after, exif_count = clean(args.source, args.destination, args.max_px, args.quality)

    src_kb = os.path.getsize(args.source) // 1024
    dst_kb = os.path.getsize(args.destination) // 1024
    print(f"  {args.source}")
    print(f"    {before[0]}x{before[1]}  {src_kb} KB  {exif_count} exif tags")
    print(f"  {args.destination}")
    print(f"    {after[0]}x{after[1]}  {dst_kb} KB  0 exif tags   ({100 - dst_kb * 100 // src_kb}% smaller)")

    # Prove it rather than assert it.
    check = Image.open(args.destination)
    remaining = len(check.getexif())
    if remaining:
        print(f"\n  WARNING: {remaining} exif tags survived", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

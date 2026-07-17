#!/usr/bin/env python3
"""Render the provided icon SVG to PNGs at common extension sizes."""
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

SIZES = [16, 24, 32, 48, 128]
OUT_DIR = Path("public/icon")
SVG_PATH = Path("icon_cat_quote.svg")

SVG = SVG_PATH.read_text()

# Tighten the viewBox so the icon fills the square instead of floating in a
# large canvas.
paths = re.findall(r'<path d="([^"]+)"', SVG)
nums = []
for d in paths:
    nums += [float(n) for n in re.findall(r'-?\d+\.?\d*', d)]
xs = nums[0::2]
ys = nums[1::2]
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)
content_w = max_x - min_x
content_h = max_y - min_y
center_x = (min_x + max_x) / 2
center_y = (min_y + max_y) / 2
# 8% padding so it doesn't touch the edges
side = max(content_w, content_h) * 1.08
vb_x = center_x - side / 2
vb_y = center_y - side / 2
viewbox = f"{vb_x:.2f} {vb_y:.2f} {side:.2f} {side:.2f}"

# Replace the root svg opening tag with a square, scalable one.
SVG = re.sub(
    r'<svg[^>]*>',
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">',
    SVG,
    count=1,
)

HTML = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body {{ margin: 0; width: 100%; height: 100%; background: transparent; }}
  </style>
</head>
<body>
  {SVG}
</body>
</html>'''

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for size in SIZES:
            page.set_viewport_size({"width": size, "height": size})
            page.set_content(HTML)
            page.wait_for_timeout(80)
            path = OUT_DIR / f"{size}.png"
            page.screenshot(path=str(path), omit_background=True)
            print(f"wrote {path}")
        browser.close()

if __name__ == "__main__":
    main()

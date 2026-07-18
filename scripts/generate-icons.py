#!/usr/bin/env python3
"""Render the provided icon SVG to PNGs at common extension sizes."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

SIZES = [16, 24, 32, 48, 128]
OUT_DIR = Path("public/icon")
SVG_PATH = Path("icon.svg")

# The master SVG is a square, icon-ready tile; render it as-is.
SVG = SVG_PATH.read_text()

HTML = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body {{ margin: 0; width: 100%; height: 100%; background: transparent; }}
    svg {{ display: block; width: 100%; height: 100%; }}
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

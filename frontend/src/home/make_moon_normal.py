"""
Build public/tex/moon_normal.png from NASA's CGI Moon Kit displacement map (LOLA heights).

Usage (from the frontend folder):
    pip install numpy pillow scipy tifffile imagecodecs
    python tools/make_moon_normal.py path/to/ldem_16.tif
Optional:  --size 4096   output width (height = width / 2). Use 2048 if the page feels heavy.
           --strength 3  relief exaggeration (1 = true slopes, 3 looks better at this distance)

Use the 16 pixels-per-degree file (about 5760 x 2880). The 4 ppd file (1440 x 720) is too coarse and gives facets.
Credit: NASA's Scientific Visualization Studio (CGI Moon Kit), LRO / LOLA.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
try:
    from scipy.ndimage import gaussian_filter
except ImportError:
    def gaussian_filter(values, sigma):
        return values

Image.MAX_IMAGE_PIXELS = None
MOON_R = 1_737_400.0  # metres, LRO reference sphere

ap = argparse.ArgumentParser()
ap.add_argument("height_tif")
ap.add_argument("--size", type=int, default=4096)
ap.add_argument("--strength", type=float, default=3.0)
ap.add_argument("--out", default="public/tex/moon_normal.png")
a = ap.parse_args()

# ---- 1. read heights, convert to metres ----
try:
    import tifffile
    arr = tifffile.imread(a.height_tif)
except Exception:
    arr = np.array(Image.open(a.height_tif))
arr = np.squeeze(arr)
print("input:", arr.shape, arr.dtype, "min/max:", arr.min(), arr.max())

if arr.dtype.kind == "f":          # float TIFF: kilometres relative to the reference radius
    h = arr.astype(np.float32) * 1000.0
else:                              # 16-bit TIFF: signed half-metres
    h = arr.astype(np.int32)
    h[h > 32767] -= 65536
    h = h.astype(np.float32) * 0.5

# ---- 2. resize to the output size (float precision, no 8-bit steps) ----
W, H = a.size, a.size // 2
h = np.array(Image.fromarray(h, mode="F").resize((W, H), Image.BILINEAR))
h = gaussian_filter(h, sigma=0.8)  # removes noise that would show up as grain

# ---- 3. slopes in real units (metres per metre) ----
lat = (0.5 - (np.arange(H) + 0.5) / H) * np.pi
dy_m = np.pi * MOON_R / H
dx_m = np.maximum(2 * np.pi * MOON_R / W * np.cos(lat), 1e-3 * dy_m)[:, None]
dz_dcol = np.gradient(h, axis=1) / dx_m   # east
dz_drow = np.gradient(h, axis=0) / dy_m   # south (image rows go down)

# ---- 4. normal vectors (tangent space: +X east, +Y north, +Z up) ----
nx = -dz_dcol * a.strength
ny = dz_drow * a.strength
nz = np.ones_like(nx)
ln = np.sqrt(nx**2 + ny**2 + nz**2)
rgb = np.stack([nx / ln, ny / ln, nz / ln], axis=-1) * 0.5 + 0.5

out = Path(a.out)
out.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray((rgb * 255).astype(np.uint8)).save(out, optimize=True)
print(f"saved {out}  ({W}x{H}, strength {a.strength}) - {out.stat().st_size / 1e6:.1f} MB")

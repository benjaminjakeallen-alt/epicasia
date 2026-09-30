import sys, numpy as np
from PIL import Image
from scipy import ndimage
# usage: cutout.py <src> <dst> [size=360] [anchor=center|bottom] [pad=1.2]
# anchor=bottom sits the object on the bottom edge (launch landmarks stand
# on the planet's rim); center pads evenly (menu icons).
src, dst = sys.argv[1], sys.argv[2]
SIZE = int(sys.argv[3]) if len(sys.argv) > 3 else 360
ANCHOR = sys.argv[4] if len(sys.argv) > 4 else 'center'
PAD = float(sys.argv[5]) if len(sys.argv) > 5 else 1.2
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h, w, _ = im.shape
border = np.concatenate([im[:4].reshape(-1,3), im[-4:].reshape(-1,3), im[:,:4].reshape(-1,3), im[:,-4:].reshape(-1,3)])
bg = np.median(border, axis=0)
d = np.sqrt(((im - bg) ** 2).sum(-1))
T0, T1 = 6.0, 30.0
# background = near-bg pixels connected to the image border
lab, _ = ndimage.label(d < T1)
edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:,0], lab[:,-1]]))
bgmask = np.isin(lab, edge[edge > 0])
alpha = np.ones((h, w), np.float32)
alpha[bgmask] = np.clip((d[bgmask] - T0) / (T1 - T0), 0, 1)
alpha = ndimage.gaussian_filter(alpha, 0.7)
# un-premultiply the bg tint out of semi-transparent edge pixels
a3 = np.clip(alpha, 1e-3, 1)[..., None]
rgb = np.clip((im - bg * (1 - a3)) / a3, 0, 255)
rgb = np.where(alpha[..., None] > 0.02, rgb, 0)
ys, xs = np.where(ndimage.binary_opening(alpha > 0.2, iterations=2))
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
out = np.dstack([rgb, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]
side = int(max(y1 - y0, x1 - x0) * PAD)
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
top = side - (y1 - y0) if ANCHOR == 'bottom' else (side - (y1 - y0)) // 2
canvas.paste(Image.fromarray(out, 'RGBA'), ((side - (x1 - x0)) // 2, top))
canvas.resize((SIZE, SIZE), Image.LANCZOS).save(dst, optimize=True)
print(dst, 'bg', bg.round(), 'bbox', (x0, y0, x1, y1))

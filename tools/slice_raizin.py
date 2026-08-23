#!/usr/bin/env python3
"""
雷神の設定シート（前・左・右・後ろが1枚に並んだ画像）から、
ゲームで使う4方向のスプライトを切り出す。

やっていること:
  1. 外周からの塗りつぶしで背景（薄いグレー）だけを透明にする。
     色指定で抜くと、ロボットの白いパーツまで消えてしまうため。
  2. 残った塊のうち大きい4つを、左から順に FRONT / LEFT / RIGHT / BACK として拾う。
  3. 各方向で「土台（茶色）の中心と底」を基準点にして、
     まったく同じ大きさのキャンバスへ貼り直す。
     これで、向きを切り替えても大きさが跳ねたり左右にずれたりしない。

  python3 tools/slice_raizin.py assets/raizin_daruma.png
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

BG_TOLERANCE = 18          # 背景とみなす色のゆらぎ
MIN_BLOB_PIXELS = 20000    # これより小さい塊は文字や飾りとして捨てる
BROWN = np.array([157, 118, 73])
BROWN_TOLERANCE = 46
PAD = 8                    # 左右と上の余白（px）。下端は土台の底にぴったり合わせる

NAMES = ['front', 'left', 'right', 'back']


def background_mask(rgb):
    """外周から届く範囲の「背景色っぽい画素」を True にする。"""
    h, w, _ = rgb.shape
    seed = rgb[0, 0].astype(int)
    close = (np.abs(rgb.astype(int) - seed).max(axis=2) <= BG_TOLERANCE)

    out = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not out[y, x]:
                out[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not out[y, x]:
                out[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    return out


def blobs(mask):
    """True の連結成分を (面積, 上, 下, 左, 右, ラベル画像) で返す。"""
    h, w = mask.shape
    label = np.zeros((h, w), dtype=np.int32)
    found = []
    current = 0
    for sy in range(h):
        row = mask[sy]
        for sx in range(w):
            if not row[sx] or label[sy, sx]:
                continue
            current += 1
            q = deque([(sy, sx)])
            label[sy, sx] = current
            area = 0
            y0 = y1 = sy
            x0 = x1 = sx
            while q:
                y, x = q.popleft()
                area += 1
                y0, y1 = min(y0, y), max(y1, y)
                x0, x1 = min(x0, x), max(x1, x)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = current
                        q.append((ny, nx))
            found.append((area, y0, y1, x0, x1, current))
    return found, label


def bleed_edges(rgba, passes=6):
    """
    透明にした画素の色を、まわりの不透明な色で埋めていく。
    元の背景色（薄いグレー）を残したままだと、拡大縮小のときに
    輪郭へその色がにじみ出て、白いふちが付いて見えてしまう。
    """
    rgb = rgba[:, :, :3].astype(np.float32)
    solid = rgba[:, :, 3] > 0
    for _ in range(passes):
        if solid.all():
            break
        total = np.zeros_like(rgb)
        count = np.zeros(solid.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted_rgb = np.roll(rgb, (dy, dx), axis=(0, 1))
            shifted_solid = np.roll(solid, (dy, dx), axis=(0, 1))
            total += shifted_rgb * shifted_solid[:, :, None]
            count += shifted_solid
        fill = (~solid) & (count > 0)
        rgb[fill] = total[fill] / count[fill][:, None]
        solid = solid | fill
    rgba[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return rgba


def main(src, outdir='assets'):
    im = Image.open(src).convert('RGBA')
    rgb = np.array(im)[:, :, :3]
    h, w, _ = rgb.shape

    bg = background_mask(rgb)
    fg = ~bg

    found, label = blobs(fg)
    found.sort(reverse=True)
    figures = [f for f in found if f[0] >= MIN_BLOB_PIXELS][:4]
    if len(figures) < 4:
        sys.exit(f'雷神を4体見つけられなかった（{len(figures)}体）。しきい値を見直すこと。')
    figures.sort(key=lambda f: f[3])  # 左から順

    # まず各体の「土台の中心と底」を測る
    metrics = []
    for area, y0, y1, x0, x1, lab in figures:
        sub = label[y0:y1 + 1, x0:x1 + 1] == lab
        subrgb = rgb[y0:y1 + 1, x0:x1 + 1]
        brown = (np.abs(subrgb.astype(int) - BROWN).max(axis=2) <= BROWN_TOLERANCE) & sub
        if brown.sum() < 200:
            sys.exit('土台（茶色）が見つからない。BROWN のしきい値を見直すこと。')
        ys, xs = np.nonzero(brown)
        anchor_x = int(round(xs.mean()))          # 土台の左右中心
        anchor_y = int(ys.max())                  # 土台の底
        metrics.append(dict(area=area, y0=y0, y1=y1, x0=x0, x1=x1, lab=lab,
                            sub=sub, ax=anchor_x, ay=anchor_y))

    # 4方向で共通のキャンバスを決める。基準点は「土台の中心・底」。
    half = max(max(m['ax'], (m['x1'] - m['x0']) - m['ax']) for m in metrics)
    top = max(m['ay'] for m in metrics)
    # 土台の底より下にはみ出す輪郭線のぶんだけ、下にも余地を残す
    below = max((m['y1'] - m['y0']) - m['ay'] for m in metrics)
    out_w = half * 2 + PAD * 2
    out_h = top + PAD + below + 1

    for name, m in zip(NAMES, metrics):
        src_rgba = np.array(im)[m['y0']:m['y1'] + 1, m['x0']:m['x1'] + 1].copy()
        src_rgba[:, :, 3] = np.where(m['sub'], 255, 0)

        src_rgba = bleed_edges(src_rgba)

        canvas = np.zeros((out_h, out_w, 4), dtype=np.uint8)
        dx = out_w // 2 - m['ax']
        dy = out_h - below - 1 - m['ay']
        sh, sw, _ = src_rgba.shape
        canvas[dy:dy + sh, dx:dx + sw] = src_rgba

        path = f'{outdir}/raizin_daruma_{name}.png'
        Image.fromarray(canvas).save(path)
        print(f'{path}  {out_w}x{out_h}  (元 {m["x1"]-m["x0"]+1}x{m["y1"]-m["y0"]+1})')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'assets/raizin_daruma.png')

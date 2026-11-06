#!/usr/bin/env python3
"""Render anti-aliased TabPerch vector icons (a bird perched on tab group pills). Uses only the Python standard library."""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "icons"


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def sd_round_rect(x, y, cx, cy, hw, hh, r):
    dx = abs(x - cx) - (hw - r)
    dy = abs(y - cy) - (hh - r)
    outside = math.hypot(max(dx, 0.0), max(dy, 0.0))
    inside = min(max(dx, dy), 0.0)
    return outside + inside - r


def sd_circle(x, y, cx, cy, r):
    return math.hypot(x - cx, y - cy) - r


def sd_segment(px, py, ax, ay, bx, by, r):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    c1 = vx * wx + vy * wy
    c2 = vx * vx + vy * vy
    t = 0.0 if c2 <= 0 else max(0.0, min(1.0, c1 / c2))
    dx = px - (ax + t * vx)
    dy = py - (ay + t * vy)
    return math.hypot(dx, dy) - r


def sd_polygon(px, py, pts):
    """Signed distance to a 2D polygon (negative inside, positive outside)."""
    d2 = float("inf")
    inside = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        vx, vy = x2 - x1, y2 - y1
        wx, wy = px - x1, py - y1
        c1 = vx * wx + vy * wy
        c2 = vx * vx + vy * vy
        t = 0.0 if c2 <= 0 else max(0.0, min(1.0, c1 / c2))
        dx = wx - t * vx
        dy = wy - t * vy
        dist2 = dx * dx + dy * dy
        if dist2 < d2:
            d2 = dist2
        if ((y1 > py) != (y2 > py)) and (px < (x2 - x1) * (py - y1) / (y2 - y1) + x1):
            inside = not inside
    return -math.sqrt(d2) if inside else math.sqrt(d2)


# Crisp geometric songbird silhouette in 32x32 coordinate space
BIRD_POLY = [
    (6.2, 18.8),   # tail tip
    (11.4, 15.2),  # lower back
    (15.2, 10.2),  # upper back / shoulder
    (18.2, 7.2),   # crown back
    (21.6, 7.0),   # crown top
    (23.8, 9.2),   # forehead
    (27.4, 10.3),  # beak tip
    (23.9, 12.1),  # beak base / throat
    (23.6, 15.6),  # chest upper
    (21.2, 19.2),  # chest lower
    (17.2, 20.6),  # belly / perch contact
    (13.2, 19.4),  # under-body
    (9.4, 20.6),   # tail underside
]

WING_POLY = [
    (13.2, 15.4),
    (17.8, 11.4),
    (20.4, 13.8),
    (17.4, 17.6),
    (12.6, 17.8),
]


def blend(dst, src):
    sr, sg, sb, sa = src
    if sa <= 0.0:
        return dst
    if sa >= 1.0:
        return (sr, sg, sb, 1.0)
    dr, dg, db, da = dst
    out_a = sa + da * (1.0 - sa)
    if out_a <= 1e-6:
        return (0.0, 0.0, 0.0, 0.0)
    out_r = (sr * sa + dr * da * (1.0 - sa)) / out_a
    out_g = (sg * sa + dg * da * (1.0 - sa)) / out_a
    out_b = (sb * sa + db * da * (1.0 - sa)) / out_a
    return (out_r, out_g, out_b, out_a)


def coverage(sd, pixel_scale):
    return max(0.0, min(1.0, 0.5 - sd * pixel_scale))


def sample_icon(u, v, size):
    """u, v in [0, 32] coordinate space."""
    px = size / 32.0
    color = (0.0, 0.0, 0.0, 0.0)

    # 1. Rounded squircle badge (#23483D -> #152D26)
    bg_sd = sd_round_rect(u, v, 16.0, 16.0, 14.8, 14.8, 7.2)
    bg_a = coverage(bg_sd, px)
    if bg_a <= 0.0:
        return color
    t_grad = max(0.0, min(1.0, (v - 1.2) / 29.6))
    bg_r = (36 * (1 - t_grad) + 20 * t_grad) / 255.0
    bg_g = (74 * (1 - t_grad) + 44 * t_grad) / 255.0
    bg_b = (63 * (1 - t_grad) + 37 * t_grad) / 255.0
    color = (bg_r, bg_g, bg_b, bg_a)

    # 2. Tab-group perch bar at y=24: active copper tab group pill + collapsed sage pill
    left_pill = sd_segment(u, v, 6.6, 24.2, 18.8, 24.2, 1.85)
    left_a = coverage(left_pill, px)
    color = blend(color, (226 / 255.0, 112 / 255.0, 52 / 255.0, left_a))

    right_pill = sd_segment(u, v, 22.4, 24.2, 25.6, 24.2, 1.85)
    right_a = coverage(right_pill, px) * 0.82
    color = blend(color, (152 / 255.0, 200 / 255.0, 179 / 255.0, right_a))

    # 3. Crisp geometric bird perched above the tab bar (#FAF4E8)
    bird_sd = sd_polygon(u, v, BIRD_POLY)
    bird_a = coverage(bird_sd, px)
    color = blend(color, (250 / 255.0, 244 / 255.0, 232 / 255.0, bird_a))

    # 4. Warm copper-sand wing facet (#E5AE86) + crisp dark eye (#172F28)
    if size >= 24:
        wing_sd = sd_polygon(u, v, WING_POLY)
        wing_a = coverage(wing_sd, px) * bird_a * 0.55
        color = blend(color, (218 / 255.0, 146 / 255.0, 102 / 255.0, wing_a))

        eye_sd = sd_circle(u, v, 21.3, 10.1, 0.85)
        eye_a = coverage(eye_sd, px) * bird_a
        color = blend(color, (23 / 255.0, 47 / 255.0, 40 / 255.0, eye_a))

    return (color[0], color[1], color[2], min(bg_a, color[3]))


def write_png(path, size):
    rows = []
    sub = 3
    inv_sub = 1.0 / (sub * sub)
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            r_acc = g_acc = b_acc = a_acc = 0.0
            for sy in range(sub):
                v = (y + (sy + 0.5) / sub) * (32.0 / size)
                for sx in range(sub):
                    u = (x + (sx + 0.5) / sub) * (32.0 / size)
                    r, g, b, a = sample_icon(u, v, size)
                    r_acc += r * a
                    g_acc += g * a
                    b_acc += b * a
                    a_acc += a
            a_avg = a_acc * inv_sub
            if a_avg > 1e-5:
                r_avg = (r_acc * inv_sub) / a_avg
                g_avg = (g_acc * inv_sub) / a_avg
                b_avg = (b_acc * inv_sub) / a_avg
            else:
                r_avg = g_avg = b_avg = 0.0
            row.extend((
                int(round(max(0.0, min(1.0, r_avg)) * 255)),
                int(round(max(0.0, min(1.0, g_avg)) * 255)),
                int(round(max(0.0, min(1.0, b_avg)) * 255)),
                int(round(max(0.0, min(1.0, a_avg)) * 255)),
            ))
        rows.append(bytes(row))
    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        write_png(ROOT / f"icon{size}.png", size)


if __name__ == "__main__":
    main()

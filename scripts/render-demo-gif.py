#!/usr/bin/env python3
"""Render a smooth animated GIF demo (docs/preview.gif) showing TabPerch in action."""

import math
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_GIF = ROOT / "docs" / "preview.gif"
ICON_PATH = ROOT / "icons" / "icon128.png"

W, H = 960, 580
SCALE = 2  # Render at 2x (1920x1160) then lanczos downsample for crisp anti-aliased text/shapes


def load_font(size, bold=False, serif=False):
    candidates = []
    if serif:
        candidates = [
            "/System/Library/Fonts/Supplemental/Georgia Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Georgia.ttf",
            "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        ]
    else:
        candidates = [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/HelveticaNeue.ttc",
        ]
    for path in candidates:
        if Path(path).exists():
            try:
                idx = 2 if (bold and path.endswith("PingFang.ttc")) else 0
                return ImageFont.truetype(path, size * SCALE, index=idx)
            except Exception:
                try:
                    return ImageFont.truetype(path, size * SCALE)
                except Exception:
                    pass
    return ImageFont.load_default()


FONT_SERIF_H1 = load_font(21, bold=True, serif=True)
FONT_SERIF_H2 = load_font(17, bold=True, serif=True)
FONT_B_14 = load_font(14, bold=True)
FONT_R_13 = load_font(13, bold=False)
FONT_B_13 = load_font(13, bold=True)
FONT_B_12 = load_font(12, bold=True)
FONT_R_12 = load_font(12, bold=False)
FONT_B_11 = load_font(11, bold=True)
FONT_R_11 = load_font(11, bold=False)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * ease(t)


def rrect(draw, xy, r, fill=None, outline=None, width=1):
    x0, y0, x1, y1 = [v * SCALE for v in xy]
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r * SCALE, fill=fill, outline=outline, width=width * SCALE)


def text(draw, pos, s, font, fill="#1d1914", anchor="la"):
    draw.text((pos[0] * SCALE, pos[1] * SCALE), s, font=font, fill=fill, anchor=anchor)


def draw_cursor(canvas, x, y, clicking=False):
    """Draw a clean macOS-style pointer cursor with click ring."""
    draw = ImageDraw.Draw(canvas, "RGBA")
    cx, cy = x * SCALE, y * SCALE
    if clicking:
        r = 18 * SCALE
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(196, 98, 45, 210), width=3 * SCALE)
        r2 = 10 * SCALE
        draw.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(196, 98, 45, 70))

    pts = [
        (cx, cy),
        (cx, cy + 22 * SCALE),
        (cx + 5.5 * SCALE, cy + 17.5 * SCALE),
        (cx + 9.5 * SCALE, cy + 25 * SCALE),
        (cx + 13 * SCALE, cy + 23.5 * SCALE),
        (cx + 9 * SCALE, cy + 16 * SCALE),
        (cx + 16 * SCALE, cy + 16 * SCALE),
    ]
    draw.polygon(pts, fill=(24, 22, 20, 245), outline=(255, 255, 255, 255))


def draw_tab_strip(draw, phase, sub_t):
    """
    phase 0: Messy scattered tabs before sorting
    phase 1: Sorted & grouped (example.com expanded, shop.example.net collapsed)
    phase 2: Accordion switch (example.com collapsed, shop.example.net expanded)
    phase 3: Idle tabs perched (fewer total tabs, clean strip)
    """
    # Browser window top bar
    rrect(draw, (28, 22, 932, 92), 14, fill="#e6dfd2", outline="#cabca4", width=1)

    # Traffic lights
    for i, col in enumerate(("#e06c5a", "#e5b55a", "#64b26b")):
        cx = (48 + i * 16) * SCALE
        cy = 42 * SCALE
        r = 5 * SCALE
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)

    # Step badge in top right of browser bar
    step_labels = [
        "1. Crowded & unsorted tabs",
        "2. Auto-grouped by service (www + testsite merged)",
        "3. Accordion expand: other open group collapses",
        "4. Idle tabs perched into local Memory",
    ]
    badge_text = step_labels[phase]
    rrect(draw, (595, 31, 918, 53), 11, fill="#23443a")
    text(draw, (756.5, 42), badge_text, FONT_B_11, fill="#f7f1e6", anchor="mm")

    y0, y1 = 58, 84

    if phase == 0:
        # 6 cluttered ungrouped tabs with truncated titles
        scattered = [
            ("www.example.com", "Release Plan..."),
            ("shop.example.net", "Shop Admin..."),
            ("test.example.com", "Staging API..."),
            ("one.example.net", "Monitor #1..."),
            ("shop.testsite.exa...", "Test Shop..."),
            ("two.example.net", "Queue Work..."),
        ]
        x = 40
        for host, title in scattered:
            w = 142
            rrect(draw, (x, y0, x + w, y1), 8, fill="#fffaf2", outline="#d2c4ae", width=1)
            text(draw, (x + 8, y0 + 5), title, FONT_B_11, fill="#1d1914")
            text(draw, (x + 8, y0 + 15), host, FONT_R_11, fill="#6e6559")
            x += w + 6

    elif phase == 1:
        # Group 1 expanded: example.com (contains www.example.com + test.example.com)
        rrect(draw, (40, y0 - 2, 468, y1 + 2), 10, fill="#dbe3de", outline="#23443a", width=2)
        rrect(draw, (45, y0 + 2, 138, y1 - 2), 7, fill="#23443a")
        text(draw, (91.5, (y0 + y1) / 2), "example.com", FONT_B_11, fill="#fffaf3", anchor="mm")

        rrect(draw, (144, y0 + 1, 298, y1 - 1), 7, fill="#fffaf2", outline="#cbbca5")
        text(draw, (152, y0 + 7), "Release Plan · www", FONT_B_11, fill="#1d1914")

        rrect(draw, (304, y0 + 1, 462, y1 - 1), 7, fill="#fffaf2", outline="#cbbca5")
        text(draw, (312, y0 + 7), "Staging API · test", FONT_B_11, fill="#1d1914")

        # Collapsed service groups next to it
        pills = [
            (478, 608, "#c4622d", "shop.example.net (2)"),
            (616, 736, "#6b4c7b", "one.example.net"),
            (744, 864, "#2d6a73", "two.example.net"),
        ]
        for x0, x1, col, label in pills:
            rrect(draw, (x0, y0 + 2, x1, y1 - 2), 7, fill=col)
            text(draw, ((x0 + x1) / 2, (y0 + y1) / 2), label, FONT_B_11, fill="#fffaf3", anchor="mm")

    else:
        # Phase 2 & 3: example.com collapsed, shop.example.net expanded!
        rrect(draw, (40, y0 + 2, 148, y1 - 2), 7, fill="#23443a")
        text(draw, (94, (y0 + y1) / 2), "example.com (2)", FONT_B_11, fill="#fffaf3", anchor="mm")

        rrect(draw, (156, y0 - 2, 624, y1 + 2), 10, fill="#f3e1d6", outline="#c4622d", width=2)
        rrect(draw, (161, y0 + 2, 276, y1 - 2), 7, fill="#c4622d")
        text(draw, (218.5, (y0 + y1) / 2), "shop.example.net", FONT_B_11, fill="#fffaf3", anchor="mm")

        rrect(draw, (282, y0 + 1, 444, y1 - 1), 7, fill="#fffaf2", outline="#cbbca5")
        text(draw, (290, y0 + 7), "Shop Admin · prod", FONT_B_11, fill="#1d1914")

        rrect(draw, (450, y0 + 1, 618, y1 - 1), 7, fill="#fffaf2", outline="#cbbca5")
        text(draw, (458, y0 + 7), "Shop Admin · testsite", FONT_B_11, fill="#1d1914")

        rrect(draw, (632, y0 + 2, 752, y1 - 2), 7, fill="#6b4c7b")
        text(draw, (692, (y0 + y1) / 2), "one.example.net", FONT_B_11, fill="#fffaf3", anchor="mm")


def draw_popup(canvas, draw, icon_img, phase, sort_highlight=False, perch_highlight=False):
    px, py = 270, 112
    pw, ph = 420, 444

    # Card shadow & body
    rrect(draw, (px + 4, py + 8, px + pw + 4, py + ph + 8), 18, fill=(24, 20, 15, 38))
    rrect(draw, (px, py, px + pw, py + ph), 18, fill="#f3ecdf", outline="#d4c6b0", width=1)

    # Header icon + title
    icon_resized = icon_img.resize((36 * SCALE, 36 * SCALE), Image.Resampling.LANCZOS)
    canvas.paste(icon_resized, ((px + 18) * SCALE, (py + 16) * SCALE), icon_resized)

    text(draw, (px + 64, py + 15), "TabPerch", FONT_SERIF_H1, fill="#1d1914")
    summary = "24 tabs open · nothing to perch" if phase == 3 else "28 tabs open · 4 can perch"
    text(draw, (px + 64, py + 38), summary, FONT_R_12, fill="#5e564c")

    # Gear button
    rrect(draw, (px + pw - 48, py + 17, px + pw - 16, py + 49), 16, fill="#f3ecdf", outline="#d9cdb8")
    text(draw, (px + pw - 32, py + 33), "⚙", FONT_B_14, fill="#23443a", anchor="mm")

    # Notice bar
    rrect(draw, (px + 18, py + 62, px + pw - 18, py + 94), 8, fill="#f6e6d8", outline="#e5c5ad")
    draw.rectangle(
        [(px + 18) * SCALE, (py + 62) * SCALE, (px + 22) * SCALE, (py + 94) * SCALE],
        fill="#c4622d",
    )
    if phase == 0:
        notice_str = "Last check 20m ago · 4 idle tabs ready"
        show_reopen_all = False
    elif phase in (1, 2):
        notice_str = "This window is grouped by service."
        show_reopen_all = False
    else:
        notice_str = "Perched 4 tabs. URLs saved in memory."
        show_reopen_all = True

    text(draw, (px + 30, py + 78), notice_str, FONT_R_12, fill="#1d1914", anchor="lm")
    if show_reopen_all:
        text(draw, (px + pw - 28, py + 78), "Reopen all", FONT_B_12, fill="#2c6b54", anchor="rm")

    # Preview hint line
    if phase < 3:
        hint_str = "Next to perch: API migration checklist · Release notes (+2)"
    else:
        hint_str = "All active & allowlisted tabs kept open (>= 12 tabs)"
    text(draw, (px + 18, py + 104), hint_str, FONT_R_11, fill="#5e564c")

    # Action buttons
    b1_fill = "#e3d6c1" if sort_highlight else "#f3ecdf"
    rrect(draw, (px + 18, py + 124, px + 205, py + 158), 17, fill=b1_fill, outline="#c9bba4")
    text(draw, (px + 111.5, py + 141), "Sort this window", FONT_B_13, fill="#1d1914", anchor="mm")

    b2_fill = "#a94e1f" if perch_highlight else ("#d8ccb8" if phase == 3 else "#c4622d")
    b2_fg = "#7c7265" if phase == 3 else "#fffaf3"
    rrect(draw, (px + 215, py + 124, px + pw - 18, py + 158), 17, fill=b2_fill)
    text(draw, (px + 308.5, py + 141), "Perch idle tabs", FONT_B_13, fill=b2_fg, anchor="mm")

    # Memory section header
    draw.line(
        [(px + 18) * SCALE, (py + 172) * SCALE, (px + pw - 18) * SCALE, (py + 172) * SCALE],
        fill="#d9cdb8",
        width=SCALE,
    )
    text(draw, (px + 18, py + 182), "Memory", FONT_SERIF_H2, fill="#1d1914")

    # Filter chips (All / Perched)
    all_active = phase < 3
    rrect(draw, (px + pw - 122, py + 181, px + pw - 82, py + 201), 10, fill="#23443a" if all_active else "#f3ecdf", outline="#23443a" if all_active else "#d9cdb8")
    text(draw, (px + pw - 102, py + 191), "All", FONT_B_11, fill="#f7f1e6" if all_active else "#5e564c", anchor="mm")

    rrect(draw, (px + pw - 78, py + 181, px + pw - 18, py + 201), 10, fill="#23443a" if not all_active else "#f3ecdf", outline="#23443a" if not all_active else "#d9cdb8")
    text(draw, (px + pw - 48, py + 191), "Perched", FONT_B_11, fill="#f7f1e6" if not all_active else "#5e564c", anchor="mm")

    # Search input
    rrect(draw, (px + 18, py + 210, px + pw - 18, py + 240), 9, fill="#fffaf2", outline="#d9cdb8")
    text(draw, (px + 28, py + 225), "Search titles or URLs", FONT_R_12, fill="#7c7265", anchor="lm")

    # Memory list items
    if phase < 3:
        items = [
            ("D", "#295e52", "Q3 architecture planning notes", "docs.example.com · perched · 2 hours ago"),
            ("M", "#6d462b", "Weekly latency & error budget", "metrics.example.com · perched · 5 hours ago"),
            ("C", "#2f4b6e", "Chrome Extensions tabGroups API", "developer.chrome.com · closed · 1 day ago"),
        ]
    else:
        items = [
            ("A", "#9c4b26", "API migration checklist (v2)", "docs.example.com · perched · just now"),
            ("R", "#295e52", "Release retrospective notes", "notes.example.com · perched · just now"),
            ("Q", "#2f4b6e", "Q3 architecture planning notes", "docs.example.com · perched · 2 hours ago"),
        ]

    ry = py + 250
    for letter, badge_col, title_str, meta_str in items:
        rrect(draw, (px + 18, ry, px + pw - 18, ry + 54), 11, fill="#fffaf2", outline="#d9cdb8")
        rrect(draw, (px + 26, ry + 13, px + 54, ry + 41), 8, fill=badge_col)
        text(draw, (px + 40, ry + 27), letter, FONT_B_13, fill="#f7f1e6", anchor="mm")

        text(draw, (px + 64, ry + 11), title_str, FONT_B_12, fill="#1d1914")
        text(draw, (px + 64, ry + 29), meta_str, FONT_R_11, fill="#5e564c")

        text(draw, (px + pw - 28, ry + 17), "Reopen", FONT_B_11, fill="#2c6b54", anchor=" rm".strip())
        text(draw, (px + pw - 28, ry + 34), "Forget", FONT_B_11, fill="#8d3b2f", anchor=" rm".strip())
        ry += 62


_STAGE_CACHE = {}


def render_stage(phase, sort_hl=False, perch_hl=False):
    key = (phase, sort_hl, perch_hl)
    if key not in _STAGE_CACHE:
        canvas = Image.new("RGBA", (W * SCALE, H * SCALE), (226, 214, 195, 255))
        draw = ImageDraw.Draw(canvas, "RGBA")
        rrect(draw, (10, 10, W - 10, H - 10), 22, fill="#dfd2bd", outline="#c9bba4", width=1)
        icon_img = Image.open(ICON_PATH).convert("RGBA")
        draw_tab_strip(draw, phase, 0.0)
        draw_popup(canvas, draw, icon_img, phase, sort_highlight=sort_hl, perch_highlight=perch_hl)
        _STAGE_CACHE[key] = canvas
    return _STAGE_CACHE[key].copy()


def render_scene(phase, cursor_pos, clicking=False, sort_hl=False, perch_hl=False):
    canvas = render_stage(phase, sort_hl=sort_hl, perch_hl=perch_hl)
    draw_cursor(canvas, cursor_pos[0], cursor_pos[1], clicking=clicking)
    return canvas.resize((W, H), Image.Resampling.LANCZOS)


def main():
    # Keyframe script (20 fps, ~5.6 seconds total loop)
    frames = []

    # 1. Start on scattered tabs, cursor moves to "Sort this window" (381, 253)
    p_start = (520, 320)
    p_sort = (381, 253)
    p_group_pill = (543, 71)
    p_perch = (578, 253)
    p_reopen = (630, 190)

    # Move to Sort button (14 frames)
    for i in range(14):
        t = i / 13.0
        pos = (lerp(p_start[0], p_sort[0], t), lerp(p_start[1], p_sort[1], t))
        frames.append(render_scene(0, pos))

    # Click Sort button (6 frames)
    for i in range(6):
        frames.append(render_scene(0, p_sort, clicking=(i < 4), sort_hl=True))

    # Phase 1: Grouped! Hold briefly then move cursor to "shop.example.net" pill in tab strip (22 frames)
    for i in range(8):
        frames.append(render_scene(1, p_sort))
    for i in range(14):
        t = i / 13.0
        pos = (lerp(p_sort[0], p_group_pill[0], t), lerp(p_sort[1], p_group_pill[1], t))
        frames.append(render_scene(1, pos))

    # Click "shop.example.net" pill in tab strip (6 frames)
    for i in range(6):
        frames.append(render_scene(1, p_group_pill, clicking=(i < 4)))

    # Phase 2: Accordion expand! shop.example.net opens, example.com collapses (22 frames)
    for i in range(8):
        frames.append(render_scene(2, p_group_pill))
    for i in range(14):
        t = i / 13.0
        pos = (lerp(p_group_pill[0], p_perch[0], t), lerp(p_group_pill[1], p_perch[1], t))
        frames.append(render_scene(2, pos))

    # Click "Perch idle tabs" button (6 frames)
    for i in range(6):
        frames.append(render_scene(2, p_perch, clicking=(i < 4), perch_hl=True))

    # Phase 3: Idle tabs perched into Memory, cursor moves toward "Reopen all" and holds (24 frames)
    for i in range(12):
        t = i / 11.0
        pos = (lerp(p_perch[0], p_reopen[0], t), lerp(p_perch[1], p_reopen[1], t))
        frames.append(render_scene(3, pos))
    for i in range(14):
        frames.append(render_scene(3, p_reopen))

    quantized = [f.convert("RGB").quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE) for f in frames]
    quantized[0].save(
        OUT_GIF,
        save_all=True,
        append_images=quantized[1:],
        optimize=True,
        duration=65,
        loop=0,
    )
    print(f"Saved {OUT_GIF} ({OUT_GIF.stat().st_size // 1024} KB, {len(frames)} frames)")


if __name__ == "__main__":
    main()

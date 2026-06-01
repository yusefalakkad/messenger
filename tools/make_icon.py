#!/usr/bin/env python3
"""
Генератор иконки Dakka — чат-бабл с эквалайзером на брендовом градиенте.

Дизайн (по референсу):
  • Тёмная плитка с лёгким brand-glow по центру
  • Чат-бабл скруглённый + хвостик в левом нижнем углу
  • Заливка бабла: розовый → фиолетовый → оранжевый
  • Внутри: 4 вертикальные полоски эквалайзера разной высоты, чёрные с rounded ends

Запуск:
    python3 tools/make_icon.py
"""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Палитра
PINK    = (0xFF, 0x4D, 0x8D)
FUCHSIA = (0xD9, 0x46, 0xEF)
VIOLET  = (0x7C, 0x4D, 0xFF)
ORANGE  = (0xFF, 0x8A, 0x3D)
DARK_BG = (0x0E, 0x0E, 0x18)   # тёмная плитка
BLACK   = (0x05, 0x05, 0x0A)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def build_bubble_gradient(w: int, h: int) -> Image.Image:
    """Диагональный розовый → фиолетовый → оранжевый градиент."""
    img = Image.new("RGB", (w, h), PINK)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (2 * max(w, h))
            if t < 0.5:
                c = lerp(PINK, FUCHSIA, t / 0.5)
            else:
                c = lerp(FUCHSIA, ORANGE, (t - 0.5) / 0.5)
            px[x, y] = c
    return img


def rounded_mask(size_w: int, size_h: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size_w, size_h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size_w - 1, size_h - 1), radius=radius, fill=255)
    return mask


def make_dark_tile(size: int) -> Image.Image:
    """Базовая тёмная плитка с brand-glow в центре."""
    base = Image.new("RGBA", (size, size), DARK_BG + (255,))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    # Brand-glow центр
    cx, cy = size // 2, size // 2
    r = int(size * 0.42)
    for i in range(40, 0, -1):
        alpha = int(28 * (i / 40) ** 2)
        gd.ellipse(
            (cx - r * i // 40, cy - r * i // 40, cx + r * i // 40, cy + r * i // 40),
            fill=(0xFF, 0x4D, 0x8D, alpha),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.05))
    base = Image.alpha_composite(base, glow)
    return base


def make_bubble(width: int, height: int, tail_size: int) -> Image.Image:
    """
    Шейп бабла: rounded rect + треугольный хвостик слева внизу.
    Возвращает RGBA-картинку нужного размера, заполненную brand-градиентом
    в форме бабла (фон прозрачный).
    """
    canvas_w = width + tail_size
    canvas_h = height + tail_size
    # 1. Маска формы бабла
    mask = Image.new("L", (canvas_w, canvas_h), 0)
    md = ImageDraw.Draw(mask)

    radius = int(min(width, height) * 0.30)
    # Основное тело бабла — отступ слева на tail_size чтобы хвост влез
    body_left = tail_size
    body_top  = 0
    body_right = body_left + width
    body_bottom = height
    md.rounded_rectangle(
        (body_left, body_top, body_right, body_bottom),
        radius=radius,
        fill=255,
    )

    # Хвостик — треугольник слева внизу
    tail_pts = [
        (body_left + radius * 0.6, body_bottom - radius * 0.4),  # вход в бабл, верх
        (body_left - tail_size * 0.6, body_bottom + tail_size * 0.3),  # острый кончик
        (body_left + radius * 1.4, body_bottom),  # выход на нижней грани бабла
    ]
    md.polygon(tail_pts, fill=255)

    # 2. Градиент-заливка под маску
    grad = build_bubble_gradient(canvas_w, canvas_h)
    out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def make_equalizer(width: int, height: int, color=BLACK) -> Image.Image:
    """4 вертикальных полоски разной высоты с rounded-ends."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    bars = 4
    gap = int(width * 0.06)
    bar_w = (width - gap * (bars - 1)) // bars
    heights = [0.55, 0.95, 0.70, 0.85]  # пропорции
    radius = bar_w // 2

    for i in range(bars):
        x0 = i * (bar_w + gap)
        bar_h = int(height * heights[i])
        y0 = (height - bar_h) // 2
        d.rounded_rectangle(
            (x0, y0, x0 + bar_w, y0 + bar_h),
            radius=radius,
            fill=color + (255,),
        )
    return img


def make_master(size: int = 1024) -> Image.Image:
    base = make_dark_tile(size)

    # Размеры бабла
    bubble_w = int(size * 0.62)
    bubble_h = int(size * 0.62)
    tail = int(size * 0.10)
    bubble = make_bubble(bubble_w, bubble_h, tail)

    # Центрируем бабл (с учётом хвостика немного смещаем вправо-вверх)
    bx = (size - bubble.size[0]) // 2 + int(tail * 0.15)
    by = (size - bubble.size[1]) // 2 - int(tail * 0.15)
    base.paste(bubble, (bx, by), bubble)

    # Эквалайзер внутри бабла
    eq_w = int(bubble_w * 0.55)
    eq_h = int(bubble_h * 0.42)
    eq = make_equalizer(eq_w, eq_h)
    ex = bx + tail + (bubble_w - eq_w) // 2
    ey = by + (bubble_h - eq_h) // 2
    base.paste(eq, (ex, ey), eq)

    # Скругление углов под iOS / Android
    mask = rounded_mask(size, size, int(size * 0.225))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out


def make_maskable(size: int = 512) -> Image.Image:
    bg = Image.new("RGBA", (size, size), DARK_BG + (255,))
    safe = int(size * 0.78)
    icon = make_master(safe).resize((safe, safe), Image.LANCZOS)
    offset = (size - safe) // 2
    bg.paste(icon, (offset, offset), icon)
    return bg


def main() -> None:
    print("→ generating master 1024×1024…")
    master = make_master(1024)

    # iOS App Icon
    ios_dir = ROOT / "apps/ios/dakka/Assets.xcassets/AppIcon.appiconset"
    ios_dir.mkdir(parents=True, exist_ok=True)
    ios_path = ios_dir / "icon-1024.png"
    master.save(ios_path, "PNG", optimize=True)
    print(f"  ✓ {ios_path}")

    # Web PWA + Apple Touch
    web_icons = ROOT / "packages/web/public/icons"
    web_icons.mkdir(parents=True, exist_ok=True)
    for size in (192, 512, 180):
        master.resize((size, size), Image.LANCZOS).save(web_icons / f"icon-{size}.png", "PNG", optimize=True)
        print(f"  ✓ icon-{size}.png")

    maskable = make_maskable(512)
    maskable.save(web_icons / "icon-512-maskable.png", "PNG", optimize=True)
    print(f"  ✓ icon-512-maskable.png")

    print("\n✅ done")


if __name__ == "__main__":
    main()

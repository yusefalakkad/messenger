#!/usr/bin/env python3
"""
Генератор иконки приложения Dakka.

Рисует 1024×1024 PNG с:
  - Скруглённой подложкой (Apple-style superellipse через закруглённый rect)
  - Brand-градиент: violet → fuchsia → orange (как в веб-версии)
  - Большая белая буква «D» по центру
  - Внутреннее свечение по нижнему правому краю для глубины

Также ресайзит до набора размеров для iOS / Android / Web PWA.

Запуск:
    python3 tools/make_icon.py

Создаёт:
    apps/ios/dakka/Assets.xcassets/AppIcon.appiconset/icon-1024.png
    packages/web/public/icons/icon-{192,512,180}.png
    packages/web/public/icons/icon-512-maskable.png
"""

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Brand colors (match Color+Brand.swift и tailwind.config.js)
VIOLET   = (0x7C, 0x4D, 0xFF)
FUCHSIA  = (0xD9, 0x46, 0xEF)
ORANGE   = (0xFF, 0x8A, 0x3D)
PINK     = (0xFF, 0x4D, 0x8D)
DARK_BG  = (0x0B, 0x0A, 0x14)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def build_gradient(size: int) -> Image.Image:
    """Диагональный градиент violet → fuchsia → orange."""
    img = Image.new("RGB", (size, size), VIOLET)
    px = img.load()
    for y in range(size):
        for x in range(size):
            # 0..1 по диагонали (top-left → bottom-right)
            t = (x + y) / (2 * (size - 1))
            if t < 0.55:
                c = lerp(VIOLET, FUCHSIA, t / 0.55)
            else:
                c = lerp(FUCHSIA, ORANGE, (t - 0.55) / 0.45)
            px[x, y] = c
    return img


def add_glow(img: Image.Image, size: int) -> Image.Image:
    """Мягкое свечение в нижнем правом углу для объёма."""
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    cx, cy = int(size * 0.78), int(size * 0.78)
    r = int(size * 0.5)
    for i in range(40, 0, -1):
        alpha = int(70 * (i / 40) ** 2)
        d.ellipse(
            (cx - r * i // 40, cy - r * i // 40, cx + r * i // 40, cy + r * i // 40),
            fill=(255, 255, 255, alpha),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.08))
    result = img.convert("RGBA")
    result = Image.alpha_composite(result, glow)
    return result


def rounded_mask(size: int, radius: int) -> Image.Image:
    """Маска со скруглёнными углами (Apple-style ~22% radius)."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_letter_D(img: Image.Image, size: int) -> Image.Image:
    """Большая белая D по центру — геометрически (без зависимости от шрифтов).

    Форма: «капсула с прямым левым краем» (rect + полукруг справа) минус
    меньшая такая же капсула внутри = классическая буква D.
    """
    cx, cy = size // 2, size // 2
    h       = int(size * 0.58)   # полная высота буквы
    stroke  = int(size * 0.11)   # толщина обводки/стема
    R       = h // 2             # радиус bowl'а

    # Центрируем D горизонтально: общая ширина = stroke + R
    total_w = stroke + R
    L = cx - total_w // 2
    T = cy - h // 2
    B = T + h

    # ── Outer (внешний контур) ──
    outer = Image.new("L", img.size, 0)
    od = ImageDraw.Draw(outer)
    # Вертикальная палка стема
    od.rectangle((L, T, L + stroke, B), fill=255)
    # Правый полукруг: pieslice от -90° (верх) до 90° (низ), центр на правом крае стема
    od.pieslice((L + stroke - R, T, L + stroke + R, B), -90, 90, fill=255)

    # ── Inner counter (внутренний контр-форм) ──
    inner = Image.new("L", img.size, 0)
    im = ImageDraw.Draw(inner)
    iR = R - stroke
    im.pieslice(
        (L + stroke - iR, T + stroke, L + stroke + iR, B - stroke),
        -90, 90, fill=255,
    )

    # D = outer − inner
    d_mask = ImageChops.subtract(outer, inner)

    # Накладываем белый цвет через эту маску
    white = Image.new("RGBA", img.size, (255, 255, 255, 255))
    base = img.convert("RGBA")
    base.paste(white, (0, 0), d_mask)
    return base


def make_master(size: int = 1024) -> Image.Image:
    grad = build_gradient(size)
    with_glow = add_glow(grad, size)
    with_letter = draw_letter_D(with_glow, size)

    # Скругление углов под iOS / Android
    mask = rounded_mask(size, int(size * 0.225))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(with_letter, (0, 0), mask)
    return out


def make_maskable(size: int = 512) -> Image.Image:
    """Maskable PWA icon — без скруглений (Android cropper применит маску сам).
    Контент должен быть в safe zone (центральные 80%)."""
    # На safe area (центральные 80%) ставим обычную иконку, фон — solid dark
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
        out = master.resize((size, size), Image.LANCZOS)
        path = web_icons / f"icon-{size}.png"
        out.save(path, "PNG", optimize=True)
        print(f"  ✓ {path}")

    # Maskable
    maskable = make_maskable(512)
    path = web_icons / "icon-512-maskable.png"
    maskable.save(path, "PNG", optimize=True)
    print(f"  ✓ {path}")

    print("\n✅ done")


if __name__ == "__main__":
    main()

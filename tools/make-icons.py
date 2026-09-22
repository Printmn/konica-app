"""
Regenerates the app mark: PMN over PRINTMN.

    python3 tools/make-icons.py

Native projects hold their own copies. `ios/` and `android/` are gitignored, so
EAS Build regenerates them from `assets/` — but a local `expo run:ios` or an
existing prebuild will keep serving the stale icon until you delete them:

    rm -rf ios android .expo/web/cache

One script for all four assets on purpose. The icon, the Android adaptive
foreground, the splash and the favicon are the same mark at four sizes, and
hand-editing them separately is how three of them end up saying PRINTMN and the
fourth still says KONICA.

Geometry is measured, not guessed: each line is fitted to a target width so the
seven letters of PRINTMN occupy the same optical space the six of KONICA did.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BLUE = (26, 86, 219, 255)        # #1a56db — the app's primary
PALE = (191, 219, 254, 255)      # #bfdbfe — the wordmark under the initials
WHITE = (255, 255, 255, 255)
NAVY = (15, 23, 42, 255)         # #0f172a — the splash background

# Arial-metric grotesque. Whatever is installed — the mark is set in one weight
# of one face, so a substitution shifts all four assets together rather than
# leaving the icon and the splash in different typefaces.
BOLD = next(
    (str(p) for p in map(Path, (
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/Library/Fonts/Arial Bold.ttf',
    )) if p.exists()),
    'LiberationSans-Bold.ttf',
)


def fitted(text: str, target_w: int, tracking: float = 0.0) -> ImageFont.FreeTypeFont:
    """Largest size whose rendered width (tracking included) fits `target_w`."""
    lo, hi = 4, 2000
    while lo < hi:
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(BOLD, mid)
        w = measure(text, f, tracking * mid)[0]
        if w <= target_w:
            lo = mid
        else:
            hi = mid - 1
    return ImageFont.truetype(BOLD, lo)


def measure(text: str, font: ImageFont.FreeTypeFont, gap: float) -> tuple[float, int, int]:
    """Width, cap-top and cap-bottom of `text` drawn with `gap` px of tracking."""
    probe = ImageDraw.Draw(Image.new('L', (1, 1)))
    width = 0.0
    top, bottom = 10**6, -10**6
    for i, ch in enumerate(text):
        box = probe.textbbox((0, 0), ch, font=font)
        width += box[2] - box[0] if ch != ' ' else font.size * 0.3
        width += probe.textlength(ch, font=font) - (box[2] - box[0])
        if i < len(text) - 1:
            width += gap
        top, bottom = min(top, box[1]), max(bottom, box[3])
    return width, top, bottom


def draw_tracked(d: ImageDraw.ImageDraw, cx: float, top: float, text: str,
                 font: ImageFont.FreeTypeFont, fill, gap: float) -> None:
    """Draws `text` centred on `cx` with its cap-height starting at `top`."""
    width, cap_top, _ = measure(text, font, gap)
    x = cx - width / 2
    for ch in text:
        d.text((x, top - cap_top), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + gap


def mark(size: int, *, bg, radius_ratio: float, initials_w: float,
         initials_top: float, word: str | None, word_w: float,
         word_top: float, word_track: float) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg is not None:
        d.rounded_rectangle([0, 0, size - 1, size - 1],
                            radius=int(size * radius_ratio), fill=bg)

    f = fitted('PMN', int(size * initials_w))
    draw_tracked(d, size / 2, size * initials_top, 'PMN', f, WHITE, 0)

    if word is not None:
        fw = fitted(word, int(size * word_w), word_track)
        draw_tracked(d, size / 2, size * word_top, word, fw, PALE, fw.size * word_track)
    return img


ROOT = str(Path(__file__).resolve().parent.parent / 'assets') + '/'

# App icon — the mark on its blue tile, iOS/Android store size.
mark(1024, bg=BLUE, radius_ratio=0.175, initials_w=0.70, initials_top=0.344,
     word='PRINTMN', word_w=0.60, word_top=0.782,
     word_track=0.04).save(ROOT + 'icon.png')

# Android adaptive foreground — transparent, and pulled in to survive the
# circular mask, which eats roughly the outer 15% on some launchers.
mark(1024, bg=None, radius_ratio=0, initials_w=0.58, initials_top=0.360,
     word='PRINTMN', word_w=0.50, word_top=0.700,
     word_track=0.04).save(ROOT + 'adaptive-icon.png')

# Favicon — 48px, so the wordmark would be four grey pixels. Initials only.
mark(48, bg=BLUE, radius_ratio=0.175, initials_w=0.80, initials_top=0.34,
     word=None, word_w=0, word_top=0, word_track=0).save(ROOT + 'favicon.png')

# Splash — the app tile on the dark background, with the shop's name below.
#
# Deliberately the original composition rather than a big wordmark: the splash
# is a tall portrait canvas, and `expo-splash-screen` scales this whole file to
# `imageWidth` (180) and centres it. Text set across the full width would end up
# a few pixels tall. Measurements are taken from the previous splash so the tile
# lands in exactly the same place.
W, H = 1284, 2778
TILE = 411
splash = Image.new('RGBA', (W, H), NAVY)
tile = mark(TILE, bg=BLUE, radius_ratio=0.175, initials_w=0.70, initials_top=0.344,
            word='PRINTMN', word_w=0.62, word_top=0.775, word_track=0.04)
splash.alpha_composite(tile, (round(W / 2 - TILE / 2), 1060))

d = ImageDraw.Draw(splash)
name = fitted('Printmn Konica', 566)
draw_tracked(d, W / 2, 1764, 'Printmn Konica', name, WHITE, 0)
splash.save(ROOT + 'splash.png')

print('written')

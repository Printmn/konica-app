"""
Photograph → document photo.

Four steps, in this order:

  1. read the file and turn it the right way up (phone photos carry their
     rotation in EXIF rather than in the pixels);
  2. find the face;
  3. lift the person off their background and put them on white;
  4. crop to the standard and save at print resolution.

Background removal is the only heavy dependency. It is optional at import
time — the tool still crops correctly without it, it just leaves the wall
behind the customer where it was, and says so in the response.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageOps

from geometry import (
    DEFAULT_DPI,
    SIZES,
    CropBox,
    FaceBox,
    PhotoSize,
    crop_for_face,
    eye_share,
    head_share,
    overflow,
)

WHITE = (255, 255, 255)

BACKGROUNDS: dict[str, tuple[int, int, int]] = {
    'white': WHITE,
    'blue': (200, 220, 240),
    'grey': (222, 222, 222),
}


class PhotoError(Exception):
    """Something the person at the counter can fix by taking another photo."""


@dataclass
class Result:
    image: Image.Image
    size: PhotoSize
    dpi: int
    #: True when the background really was replaced, False when `rembg` is not
    #: installed and the original background survived.
    background_removed: bool
    head_share: float
    eye_from_bottom: float
    padded: tuple[int, int, int, int]

    def to_bytes(self, fmt: str = 'JPEG', quality: int = 95) -> bytes:
        buffer = io.BytesIO()
        image = self.image
        if fmt.upper() in {'JPEG', 'JPG'} and image.mode != 'RGB':
            image = image.convert('RGB')
        image.save(buffer, format=fmt, quality=quality, dpi=(self.dpi, self.dpi))
        return buffer.getvalue()


# ── 2. Finding the face ───────────────────────────────────────────────────


def detect_face(image: Image.Image) -> FaceBox:
    """
    The largest frontal face in the picture.

    OpenCV's Haar cascade ships inside the `opencv-python` wheel, so this needs
    no model download and no network at run time — which matters for a shop
    that loses its connection. It wants a well-lit, front-facing subject, which
    is exactly what a document photo is.
    """
    try:
        import cv2  # noqa: PLC0415  (optional, and slow to import)
        import numpy as np  # noqa: PLC0415
    except ImportError as error:  # pragma: no cover - depends on the install
        raise PhotoError(
            'Нүүр илрүүлэхэд opencv-python шаардлагатай: pip install opencv-python'
        ) from error

    grey = np.array(image.convert('L'))
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    )
    faces = cascade.detectMultiScale(
        grey,
        scaleFactor=1.1,
        minNeighbors=6,
        # A document photo is mostly face; anything under a twelfth of the
        # frame's short side is a bystander or a picture on the wall.
        minSize=(min(grey.shape) // 12, min(grey.shape) // 12),
    )
    if len(faces) == 0:
        raise PhotoError(
            'Нүүр олдсонгүй. Гэрэлтэй газар, шууд урдаас нь дахин авна уу.'
        )

    x, y, w, h = max(faces, key=lambda box: int(box[2]) * int(box[3]))
    return FaceBox(x=float(x), y=float(y), width=float(w), height=float(h))


# ── 3. Putting them on a plain background ─────────────────────────────────


def replace_background(image: Image.Image, colour: tuple[int, int, int]) -> tuple[Image.Image, bool]:
    """
    Cut the person out and drop them onto a flat colour.

    Returns `(image, replaced)`. When `rembg` is missing the original comes
    back untouched rather than raising — a crop with the wall still in it is
    worth more to the counter than an error page.
    """
    try:
        from rembg import remove  # noqa: PLC0415
    except ImportError:  # pragma: no cover - depends on the install
        return image, False

    cutout = remove(image)  # RGBA, background transparent
    canvas = Image.new('RGBA', cutout.size, (*colour, 255))
    canvas.alpha_composite(cutout.convert('RGBA'))
    return canvas.convert('RGB'), True


# ── 4. Cropping to the standard ───────────────────────────────────────────


def crop_and_scale(
    image: Image.Image,
    crop: CropBox,
    size: PhotoSize,
    dpi: int,
    fill: tuple[int, int, int],
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """
    Cut out `crop` and scale it to the print size.

    A crop that runs off the edge of the photograph is padded with the
    background colour rather than pulled back inside — moving it would take the
    eyes off their line, which is the one thing the standard actually checks.
    """
    pad = overflow(crop, image.width, image.height)
    if any(pad):
        left, top, right, bottom = pad
        padded = Image.new('RGB', (image.width + left + right, image.height + top + bottom), fill)
        padded.paste(image.convert('RGB'), (left, top))
        image = padded
        crop = CropBox(crop.left + left, crop.top + top, crop.width, crop.height)

    cut = image.convert('RGB').crop(crop.rounded())
    return cut.resize(size.pixels(dpi), Image.LANCZOS), pad


# ── The whole thing ───────────────────────────────────────────────────────


def process(
    data: bytes,
    *,
    size_key: str = '3x4',
    background: str = 'white',
    dpi: int = DEFAULT_DPI,
    remove_background: bool = True,
) -> Result:
    size = SIZES.get(size_key)
    if size is None:
        raise PhotoError(f'Ийм хэмжээ байхгүй: {size_key}')
    colour = BACKGROUNDS.get(background, WHITE)

    try:
        image = Image.open(io.BytesIO(data))
        # Phones record orientation in EXIF instead of rotating the pixels, so
        # without this a portrait photo arrives on its side and the detector
        # finds nothing.
        image = ImageOps.exif_transpose(image).convert('RGB')
    except Exception as error:  # noqa: BLE001 - anything Pillow rejects
        raise PhotoError('Зургийг уншиж чадсангүй.') from error

    face = detect_face(image)

    replaced = False
    if remove_background:
        image, replaced = replace_background(image, colour)

    crop = crop_for_face(face, size)
    final, pad = crop_and_scale(image, crop, size, dpi, colour)

    return Result(
        image=final,
        size=size,
        dpi=dpi,
        background_removed=replaced,
        head_share=head_share(crop, face),
        eye_from_bottom=1 - eye_share(crop, face),
        padded=pad,
    )

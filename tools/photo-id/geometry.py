"""
Passport-photo crop geometry.

Deliberately free of Pillow, OpenCV and every model — this is the part that
decides where a head lands on the paper, so it is the part worth testing, and a
test that has to load a 180 MB segmentation model does not get run.

The numbers come from the ICAO 9303 portrait rules that Mongolian document
photos follow:

  * the head, crown to chin, fills 70–80% of the picture height;
  * the eyes sit 50–60% of the way up from the bottom edge;
  * the face is centred horizontally.

Everything downstream is scaling and padding.
"""

from __future__ import annotations

from dataclasses import dataclass

MM_PER_INCH = 25.4

# ── The four sizes the counter sells ──────────────────────────────────────


@dataclass(frozen=True)
class PhotoSize:
    key: str
    label: str
    width_mm: float
    height_mm: float

    @property
    def aspect(self) -> float:
        """Width divided by height."""
        return self.width_mm / self.height_mm

    def pixels(self, dpi: int = 300) -> tuple[int, int]:
        """Print size in pixels, rounded to whole pixels."""
        to_px = lambda mm: int(round(mm / MM_PER_INCH * dpi))  # noqa: E731
        return to_px(self.width_mm), to_px(self.height_mm)


SIZES: dict[str, PhotoSize] = {
    size.key: size
    for size in (
        PhotoSize('3x4', '3×4 см', 30, 40),
        PhotoSize('35x45', '3.5×4.5 см', 35, 45),
        PhotoSize('4x6', '4×6 см', 40, 60),
        PhotoSize('2x3', '2×3 см', 20, 30),
    )
}

DEFAULT_SIZE = '3x4'
DEFAULT_DPI = 300


# ── Placing the head inside that rectangle ────────────────────────────────

#: Head height (crown → chin) as a share of the finished picture height.
#: 0.75 is the middle of the 70–80% band, so a detector that is a little off in
#: either direction still lands inside the rule.
HEAD_RATIO = 0.75

#: Where the eye line sits, measured down from the top edge. 0.44 from the top
#: is 0.56 from the bottom — again the middle of the permitted band.
EYE_FROM_TOP = 0.44

#: A frontal-face detector returns a box from roughly the eyebrow line to just
#: below the chin. Real heads are taller than that: hair and crown add about
#: another 45%. Measured against the Haar frontal cascade, which is what the
#: pipeline uses when no landmark model is available.
BOX_TO_HEAD = 1.45

#: Where the eyes fall inside that same detected box.
EYE_IN_BOX = 0.40


@dataclass(frozen=True)
class FaceBox:
    """A detected face, in source-image pixels."""

    x: float
    y: float
    width: float
    height: float

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2


@dataclass(frozen=True)
class CropBox:
    """
    The rectangle to cut out of the source image.

    Coordinates may fall outside the source — a head photographed close to the
    top of the frame legitimately needs space above it that the camera never
    captured. The caller pads rather than clamping, because clamping would move
    the head off the eye line and quietly break the standard.
    """

    left: float
    top: float
    width: float
    height: float

    @property
    def right(self) -> float:
        return self.left + self.width

    @property
    def bottom(self) -> float:
        return self.top + self.height

    def rounded(self) -> tuple[int, int, int, int]:
        """`(left, top, right, bottom)` as whole pixels, for Pillow's crop."""
        return (
            int(round(self.left)),
            int(round(self.top)),
            int(round(self.right)),
            int(round(self.bottom)),
        )


def crop_for_face(
    face: FaceBox,
    size: PhotoSize,
    *,
    head_ratio: float = HEAD_RATIO,
    eye_from_top: float = EYE_FROM_TOP,
    box_to_head: float = BOX_TO_HEAD,
    eye_in_box: float = EYE_IN_BOX,
) -> CropBox:
    """
    The crop that puts this face on the standard.

    Height comes first: the head has to be `head_ratio` of it, which fixes the
    scale. Width then follows from the paper's aspect ratio, and the two offsets
    put the eyes on their line and the face on the centre line.
    """
    if face.height <= 0 or face.width <= 0:
        raise ValueError('face box must have a positive size')

    head_height = face.height * box_to_head
    crop_height = head_height / head_ratio
    crop_width = crop_height * size.aspect

    eye_y = face.y + face.height * eye_in_box

    return CropBox(
        left=face.center_x - crop_width / 2,
        top=eye_y - crop_height * eye_from_top,
        width=crop_width,
        height=crop_height,
    )


def head_share(crop: CropBox, face: FaceBox, box_to_head: float = BOX_TO_HEAD) -> float:
    """How much of the finished picture the head fills — a check, not a step."""
    return face.height * box_to_head / crop.height


def eye_share(crop: CropBox, face: FaceBox, eye_in_box: float = EYE_IN_BOX) -> float:
    """Where the eye line lands, as a share of height measured from the top."""
    eye_y = face.y + face.height * eye_in_box
    return (eye_y - crop.top) / crop.height


def overflow(crop: CropBox, image_width: int, image_height: int) -> tuple[int, int, int, int]:
    """
    Padding needed on each side, `(left, top, right, bottom)`, in pixels.

    All zeros means the crop fits inside the photograph as taken.
    """
    return (
        max(0, int(round(-crop.left))),
        max(0, int(round(-crop.top))),
        max(0, int(round(crop.right - image_width))),
        max(0, int(round(crop.bottom - image_height))),
    )

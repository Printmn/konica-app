"""Geometry tests. Run with `python3 -m pytest` or `python3 test_geometry.py`."""

from __future__ import annotations

from geometry import (
    SIZES,
    CropBox,
    FaceBox,
    crop_for_face,
    eye_share,
    head_share,
    overflow,
)

FACE = FaceBox(x=400, y=300, width=300, height=380)


def approx(value: float, expected: float, tolerance: float = 0.01) -> bool:
    return abs(value - expected) <= tolerance


def test_print_sizes() -> None:
    # 30 mm at 300 dpi is 354 px; the four sizes the shop sells, in order.
    assert SIZES['3x4'].pixels() == (354, 472)
    assert SIZES['35x45'].pixels() == (413, 531)
    assert SIZES['4x6'].pixels() == (472, 709)
    assert SIZES['2x3'].pixels() == (236, 354)


def test_crop_keeps_the_paper_aspect() -> None:
    for size in SIZES.values():
        crop = crop_for_face(FACE, size)
        assert approx(crop.width / crop.height, size.aspect, 0.001), size.key


def test_head_fills_the_permitted_band() -> None:
    for size in SIZES.values():
        crop = crop_for_face(FACE, size)
        share = head_share(crop, FACE)
        assert 0.70 <= share <= 0.80, (size.key, share)


def test_eyes_land_in_the_permitted_band() -> None:
    # Measured from the bottom, ICAO wants 50–60%.
    for size in SIZES.values():
        crop = crop_for_face(FACE, size)
        from_bottom = 1 - eye_share(crop, FACE)
        assert 0.50 <= from_bottom <= 0.60, (size.key, from_bottom)


def test_face_is_centred() -> None:
    crop = crop_for_face(FACE, SIZES['3x4'])
    assert approx(crop.left + crop.width / 2, FACE.center_x, 0.001)


def test_a_bigger_face_gets_a_bigger_crop() -> None:
    # Scale is set by the head, so doubling the face doubles the crop — the
    # finished picture looks identical, which is the whole point.
    small = crop_for_face(FaceBox(0, 0, 100, 120), SIZES['3x4'])
    large = crop_for_face(FaceBox(0, 0, 200, 240), SIZES['3x4'])
    assert approx(large.height / small.height, 2.0, 0.001)


def test_overflow_reports_the_padding_a_tight_shot_needs() -> None:
    # A head photographed near the top of the frame needs space above it that
    # the camera never saw; the caller has to pad, not clamp.
    crop = crop_for_face(FaceBox(x=50, y=10, width=300, height=380), SIZES['3x4'])
    left, top, right, bottom = overflow(crop, image_width=800, image_height=600)
    assert top > 0
    assert left > 0
    assert bottom >= 0 and right >= 0


def test_a_centred_face_in_a_roomy_photo_needs_no_padding() -> None:
    crop = crop_for_face(FaceBox(x=800, y=600, width=300, height=380), SIZES['3x4'])
    assert overflow(crop, image_width=2400, image_height=3000) == (0, 0, 0, 0)


def test_rounded_returns_pillow_style_corners() -> None:
    box = CropBox(left=10.4, top=20.6, width=100.0, height=200.0)
    assert box.rounded() == (10, 21, 110, 221)


if __name__ == '__main__':
    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith('test_') or not callable(fn):
            continue
        try:
            fn()
            print(f'  ok  {name}')
        except AssertionError as error:
            failures += 1
            print(f'FAIL  {name}: {error}')
    print('\nall passed' if failures == 0 else f'\n{failures} failed')
    raise SystemExit(1 if failures else 0)

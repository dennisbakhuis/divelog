"""Photo processing: HEIC input, colour profiles, the date taken and format detection."""

import io
from datetime import UTC, datetime, timedelta, timezone

from PIL import Image, ImageCms

from divelog_server.services.images import (
    DATE_TIME,
    DATE_TIME_ORIGINAL,
    EXIF_IFD,
    OFFSET_TIME_ORIGINAL,
    image_format,
    process_image,
)


def _encode(image: Image.Image, fmt: str, **params: object) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format=fmt, **params)
    return buf.getvalue()


def _icc() -> bytes:
    profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
    return bytes(profile.tobytes())


def test_a_heic_photo_is_read_and_converted() -> None:
    heic = _encode(Image.new("RGB", (1000, 750), (20, 90, 160)), "HEIF")
    assert heic[4:12] == b"ftypheic"
    assert image_format(heic) == "HEIF"
    processed = process_image(heic)
    assert processed.original_mime == "image/jpeg"
    assert (processed.width, processed.height) == (1000, 750)
    assert set(processed.variants) == {"thumb", "w800"}


def test_the_colour_profile_reaches_the_original_and_the_variants() -> None:
    icc = _icc()
    data = _encode(Image.new("RGB", (1000, 600), (200, 40, 40)), "JPEG", icc_profile=icc)
    processed = process_image(data, square=True)
    with Image.open(io.BytesIO(processed.original)) as original:
        assert original.info.get("icc_profile") == icc
    for name, blob in processed.variants.items():
        with Image.open(io.BytesIO(blob)) as variant:
            assert variant.info.get("icc_profile") == icc, name


def test_a_png_keeps_its_profile_too() -> None:
    icc = _icc()
    data = _encode(Image.new("RGBA", (300, 200), (0, 0, 0, 0)), "PNG", icc_profile=icc)
    processed = process_image(data)
    assert processed.original_mime == "image/png"
    with Image.open(io.BytesIO(processed.original)) as original:
        assert original.info.get("icc_profile") == icc


def _with_dates(**tags: str) -> bytes:
    image = Image.new("RGB", (64, 48))
    exif = image.getexif()
    if "modified" in tags:
        exif[DATE_TIME] = tags["modified"]
    sub = exif.get_ifd(EXIF_IFD)
    if "original" in tags:
        sub[DATE_TIME_ORIGINAL] = tags["original"]
    if "offset" in tags:
        sub[OFFSET_TIME_ORIGINAL] = tags["offset"]
    return _encode(image, "JPEG", exif=exif)


def test_the_date_taken_prefers_the_original_with_its_offset() -> None:
    data = _with_dates(
        modified="2026:10:25 18:00:00", original="2026:10:24 10:15:30", offset="+02:00"
    )
    taken = process_image(data).taken_at
    assert taken == datetime(2026, 10, 24, 10, 15, 30, tzinfo=timezone(timedelta(hours=2)))
    assert taken.astimezone(UTC).hour == 8


def test_the_date_taken_without_an_offset_is_the_wall_clock() -> None:
    data = _with_dates(modified="2026:10:25 18:00:00", original="2026:10:24 10:15:30")
    assert process_image(data).taken_at == datetime(2026, 10, 24, 10, 15, 30)


def test_the_date_taken_falls_back_to_the_modified_date() -> None:
    data = _with_dates(modified="2026:10:25 18:00:00")
    assert process_image(data).taken_at == datetime(2026, 10, 25, 18, 0, 0)


def test_the_format_comes_from_the_bytes() -> None:
    assert image_format(_encode(Image.new("RGB", (8, 8)), "JPEG")) == "JPEG"
    assert image_format(_encode(Image.new("RGB", (8, 8)), "WEBP")) == "WEBP"
    assert image_format(b"%PDF-1.7\n" + b"0" * 64) is None
    assert image_format(_encode(Image.new("RGB", (8, 8)), "BMP")) is None

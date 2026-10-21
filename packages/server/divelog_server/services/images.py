import io
from dataclasses import dataclass, field
from datetime import datetime

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"}
IMAGE_FORMATS = {"JPEG", "MPO", "PNG", "WEBP", "HEIF", "GIF"}
EXIF_IFD = 0x8769
DATE_TIME = 306
DATE_TIME_ORIGINAL = 36867
OFFSET_TIME_ORIGINAL = 36881
VARIANT_WIDTHS = {"thumb": 480, "w800": 800, "w1600": 1600}
SQUARE_VARIANTS = {"avatar": 256}
ORIGINAL_MAX = 3200


@dataclass
class ProcessedImage:
    original: bytes
    original_mime: str
    width: int
    height: int
    taken_at: datetime | None
    variants: dict[str, bytes] = field(default_factory=dict)


def image_format(data: bytes) -> str | None:
    """The format Pillow reads ``data`` as when it is one :func:`process_image` handles.

    The bytes decide, not the type the client declared: a JPEG sent as
    ``application/octet-stream`` is still a JPEG.
    """
    try:
        with Image.open(io.BytesIO(data)) as probe:
            found = probe.format
    except Exception:
        return None
    return found if found in IMAGE_FORMATS else None


def _taken_at(image: Image.Image) -> datetime | None:
    """When the photo was taken: ``DateTimeOriginal`` with its offset, else ``DateTime``.

    The offset (``OffsetTimeOriginal``, e.g. ``+02:00``) makes the time zone-aware when the
    camera wrote one; without it the time is the camera's wall clock.
    """
    exif = image.getexif()
    sub = exif.get_ifd(EXIF_IFD)
    original = sub.get(DATE_TIME_ORIGINAL)
    raw, offset = (
        (original, sub.get(OFFSET_TIME_ORIGINAL)) if original else (exif.get(DATE_TIME), None)
    )
    if not raw:
        return None
    text = str(raw).strip("\x00 ")
    try:
        taken = datetime.strptime(text, "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None
    if offset:
        try:
            return datetime.strptime(f"{text} {str(offset).strip()}", "%Y:%m:%d %H:%M:%S %z")
        except ValueError:
            return taken
    return taken


def process_image(data: bytes, *, square: bool = False) -> ProcessedImage:
    """Strip metadata, cap the original and render the WebP variants.

    EXIF orientation is applied before the metadata is dropped, and the date the
    photo was taken is the only field kept — GPS and camera details never reach
    the public site. The colour profile stays with the original and every variant
    (a CMYK one is dropped with the conversion to RGB). ``square`` adds the
    centre-cropped avatar size.
    """
    with Image.open(io.BytesIO(data)) as raw:
        taken_at = _taken_at(raw)
        icc = raw.info.get("icc_profile") if raw.mode != "CMYK" else None
        image = ImageOps.exif_transpose(raw) or raw
        image.load()
        has_alpha = image.mode in ("RGBA", "LA", "P")
        image = image.convert("RGBA" if has_alpha else "RGB")

    if max(image.size) > ORIGINAL_MAX:
        image.thumbnail((ORIGINAL_MAX, ORIGINAL_MAX), Image.Resampling.LANCZOS)

    original_buf = io.BytesIO()
    if has_alpha:
        image.save(original_buf, format="PNG", optimize=True, icc_profile=icc)
        original_mime = "image/png"
    else:
        image.save(
            original_buf,
            format="JPEG",
            quality=90,
            optimize=True,
            progressive=True,
            icc_profile=icc,
        )
        original_mime = "image/jpeg"

    variants: dict[str, bytes] = {}
    for name, width in VARIANT_WIDTHS.items():
        if image.width <= width and name != "thumb":
            continue
        variant = image.copy()
        variant.thumbnail((width, width * 4), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        variant.save(buf, format="WEBP", quality=82, method=4, icc_profile=icc)
        variants[name] = buf.getvalue()
    if square:
        for name, size in SQUARE_VARIANTS.items():
            fitted = ImageOps.fit(image, (size, size), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            fitted.save(buf, format="WEBP", quality=85, method=4, icc_profile=icc)
            variants[name] = buf.getvalue()

    return ProcessedImage(
        original=original_buf.getvalue(),
        original_mime=original_mime,
        width=image.width,
        height=image.height,
        taken_at=taken_at,
        variants=variants,
    )

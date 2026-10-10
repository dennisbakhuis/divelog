import io
from dataclasses import dataclass, field
from datetime import datetime

from PIL import Image, ImageOps

IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"}
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


def _taken_at(image: Image.Image) -> datetime | None:
    exif = image.getexif()
    raw = exif.get(306) or exif.get_ifd(0x8769).get(36867)
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None


def process_image(data: bytes, *, square: bool = False) -> ProcessedImage:
    """Strip metadata, cap the original and render the WebP variants.

    EXIF orientation is applied before the metadata is dropped, and the date the
    photo was taken is the only field kept — GPS and camera details never reach
    the public site. ``square`` adds the centre-cropped avatar size.
    """
    with Image.open(io.BytesIO(data)) as raw:
        taken_at = _taken_at(raw)
        image = ImageOps.exif_transpose(raw) or raw
        image.load()
        has_alpha = image.mode in ("RGBA", "LA", "P")
        image = image.convert("RGBA" if has_alpha else "RGB")

    if max(image.size) > ORIGINAL_MAX:
        image.thumbnail((ORIGINAL_MAX, ORIGINAL_MAX), Image.Resampling.LANCZOS)

    original_buf = io.BytesIO()
    if has_alpha:
        image.save(original_buf, format="PNG", optimize=True)
        original_mime = "image/png"
    else:
        image.save(original_buf, format="JPEG", quality=90, optimize=True, progressive=True)
        original_mime = "image/jpeg"

    variants: dict[str, bytes] = {}
    for name, width in VARIANT_WIDTHS.items():
        if image.width <= width and name != "thumb":
            continue
        variant = image.copy()
        variant.thumbnail((width, width * 4), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        variant.save(buf, format="WEBP", quality=82, method=4)
        variants[name] = buf.getvalue()
    if square:
        for name, size in SQUARE_VARIANTS.items():
            fitted = ImageOps.fit(image, (size, size), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            fitted.save(buf, format="WEBP", quality=85, method=4)
            variants[name] = buf.getvalue()

    return ProcessedImage(
        original=original_buf.getvalue(),
        original_mime=original_mime,
        width=image.width,
        height=image.height,
        taken_at=taken_at,
        variants=variants,
    )

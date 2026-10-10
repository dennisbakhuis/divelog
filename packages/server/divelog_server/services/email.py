import logging
from email.message import EmailMessage

import aiosmtplib

from divelog_server.core.config import get_settings

logger = logging.getLogger(__name__)


async def send_mail(to: str, subject: str, text: str) -> None:
    """Send a plain-text mail through the backend SMTP relay."""
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.BACKEND_SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)

    await aiosmtplib.send(
        message,
        hostname=settings.BACKEND_SMTP_HOST,
        port=settings.BACKEND_SMTP_PORT,
        username=settings.BACKEND_SMTP_USERNAME or None,
        password=settings.BACKEND_SMTP_PASSWORD or None,
        start_tls=settings.BACKEND_SMTP_TLS,
        timeout=15,
    )

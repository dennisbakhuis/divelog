"""The Overpass API as the server calls it: one short request at a time, failures as errors.

The ``sitemap-osm`` command line retries for minutes; a request handler cannot, so the client
here tries each endpoint once within one overall timeout and raises :class:`OverpassError`
when none answers. Endpoints take it through :func:`get_overpass_client`, which tests override.
"""

import asyncio
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Protocol

from divelog_server.tools.common import user_agent
from divelog_server.tools.sitemap_osm import OVERPASS, overpass_query

TIMEOUT_S = 15.0


class OverpassError(RuntimeError):
    """No Overpass endpoint answered in time with usable JSON."""


class OverpassClient(Protocol):
    """Anything that returns the Overpass JSON for the features around a point."""

    async def fetch(self, lat: float, lon: float, radius_m: int) -> dict[str, Any]:
        """The Overpass response with geometry; raises :class:`OverpassError` on failure."""
        ...


class HttpOverpassClient:
    """The public Overpass endpoints over HTTP, one request in flight per process.

    Parameters
    ----------
    endpoints
        Interpreter URLs, tried in order until one answers.
    timeout_s
        Budget for the whole call, every endpoint included.
    """

    def __init__(self, endpoints: tuple[str, ...] = OVERPASS, timeout_s: float = TIMEOUT_S):
        self.endpoints = endpoints
        self.timeout_s = timeout_s
        self.lock = asyncio.Lock()

    async def fetch(self, lat: float, lon: float, radius_m: int) -> dict[str, Any]:
        """The Overpass response for the features within ``radius_m`` of the point."""
        async with self.lock:
            return await asyncio.to_thread(self._fetch, lat, lon, radius_m)

    def _fetch(self, lat: float, lon: float, radius_m: int) -> dict[str, Any]:
        """Blocking request, run off the event loop."""
        query = overpass_query(lat, lon, radius_m, timeout_s=int(self.timeout_s))
        body = urllib.parse.urlencode({"data": query}).encode()
        deadline = time.monotonic() + self.timeout_s
        last = "no endpoint configured"
        for endpoint in self.endpoints:
            remaining = deadline - time.monotonic()
            if remaining <= 0.5:
                break
            request = urllib.request.Request(
                endpoint, data=body, headers={"User-Agent": user_agent()}, method="POST"
            )
            try:
                with urllib.request.urlopen(request, timeout=remaining) as response:
                    data = json.loads(response.read())
            except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
                last = f"{endpoint}: {exc}"
                continue
            if isinstance(data, dict):
                return data
            last = f"{endpoint}: unexpected response"
        raise OverpassError(f"Overpass did not answer within {self.timeout_s:.0f} s ({last})")


_client: OverpassClient | None = None


def get_overpass_client() -> OverpassClient:
    """The process-wide Overpass client; a FastAPI dependency."""
    global _client
    if _client is None:
        _client = HttpOverpassClient()
    return _client

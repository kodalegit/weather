from __future__ import annotations

import re

POPULAR_LOCATIONS: dict[str, tuple[float, float]] = {
    "nairobi": (-1.2921, 36.8219),
    "ruiru": (-1.1468, 36.9610),
    "bomet": (-0.7813, 35.3416),
    "kisumu": (-0.0917, 34.7680),
    "mombasa": (-4.0435, 39.6682),
    "nakuru": (-0.3031, 36.0800),
    "eldoret": (0.5143, 35.2698),
    "kampala": (0.3476, 32.5825),
}


def infer_location(message: str) -> tuple[str | None, float | None, float | None]:
    """Return a place name and coordinates from a user message."""
    lowered = message.lower()
    for name, (lat, lon) in POPULAR_LOCATIONS.items():
        if name in lowered:
            return name.title(), lat, lon

    match = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", message)
    if match:
        return "Pinned coordinates", float(match.group(1)), float(match.group(2))

    return None, None, None

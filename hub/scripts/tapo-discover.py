#!/usr/bin/env python3
"""Broadcast-discovers Tapo/Kasa devices on the local LAN and prints them as JSON.

Deliberately doesn't shell out to `kasa`'s own CLI output for this (unlike
tapo.ts's setPower, which does) -- `kasa discover list`'s table is meant for a
human terminal, and `kasa --json discover ...` dumps each device's full raw
protocol state (whatever internal_state happens to contain for that device's
firmware), not a small stable shape. Talking to the public Discover API
directly means this script controls the output shape itself, so it won't
shift under hub/src/tapo.ts on a python-kasa upgrade.

Usage: tapo-discover.py <username> <password> <discovery_timeout_seconds>
"""

import asyncio
import json
import sys

from kasa import Credentials, Discover


async def main() -> None:
    username, password, timeout_s = sys.argv[1], sys.argv[2], float(sys.argv[3])
    credentials = Credentials(username, password)
    found: list[dict] = []

    async def on_discovered(dev) -> None:
        entry: dict = {"host": dev.host}
        try:
            await dev.update()
            entry["alias"] = dev.alias
            entry["model"] = dev.model
            entry["reachable"] = True
        except Exception as exc:
            # Found on the LAN but couldn't log in with the saved account (wrong
            # password, or a device tied to a different TP-Link account) -- still
            # worth surfacing so the IP is known, just flagged as unreachable
            # rather than silently dropped.
            entry["reachable"] = False
            entry["error"] = str(exc)
        found.append(entry)

    await Discover.discover(
        credentials=credentials,
        discovery_timeout=timeout_s,
        on_discovered=on_discovered,
    )
    print(json.dumps(found))


asyncio.run(main())

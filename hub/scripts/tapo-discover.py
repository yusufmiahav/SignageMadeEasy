#!/usr/bin/env python3
"""Discovers Tapo/Kasa devices and prints them as JSON: a LAN broadcast pass,
plus (given one or more subnet prefixes) a direct unicast sweep of each.

Deliberately doesn't shell out to `kasa`'s own CLI output for this (unlike
tapo.ts's setPower, which does) -- `kasa discover list`'s table is meant for a
human terminal, and `kasa --json discover ...` dumps each device's full raw
protocol state (whatever internal_state happens to contain for that device's
firmware), not a small stable shape. Talking to the public Discover API
directly means this script controls the output shape itself, so it won't
shift under hub/src/tapo.ts on a python-kasa upgrade.

The broadcast pass alone only ever finds devices on the hub's own L2 segment
-- confirmed directly against a real deployment where a Tapo plug sat on a
separate guest Wi-Fi network from the NAS: broadcast discovery found nothing,
while connecting to that plug's IP directly worked fine, because routers
route unicast between subnets/VLANs but don't forward broadcast traffic
across them (that's the normal, intended behavior of a guest network, not a
misconfiguration). The subnet sweep below works around that the same way
this project's existing Pi-pairing "Scan network" feature already does for
Pi discovery (see hub/src/routes/scan.ts) -- probing every host in a given
/24 directly instead of waiting for it to announce itself.

Usage: tapo-discover.py <username> <password> <broadcast_timeout_seconds> <probe_timeout_seconds> [subnet_prefix ...]
Each subnet_prefix is an "a.b.c" /24 prefix (e.g. "10.21.137") to sweep .1-.254.
"""

import asyncio
import json
import sys

from kasa import Credentials, Discover

# Bounds how many hosts the subnet sweep below probes at once -- each one is a
# cheap UDP round-trip (not the heavier TLS/KLAP handshake, which only happens
# for the handful of addresses that actually turn out to be Tapo/Kasa
# devices), so this can run fairly high without loading down the NAS; matches
# hub/src/routes/scan.ts's own CONCURRENCY for the same kind of /24 sweep.
SWEEP_CONCURRENCY = 32


async def probe_host(ip: str, credentials: Credentials, timeout: float, found: list[dict], seen: set[str]) -> None:
    try:
        dev = await Discover.discover_single(ip, credentials=credentials, discovery_timeout=timeout, timeout=timeout)
    except Exception:
        return  # nothing answered at this address -- expected for nearly every address in a /24
    if dev is None or dev.host in seen:
        return
    seen.add(dev.host)
    entry: dict = {"host": dev.host}
    try:
        await dev.update()
        entry["alias"] = dev.alias
        entry["model"] = dev.model
        entry["reachable"] = True
    except Exception as exc:
        # Caught broadly, not just AuthenticationError -- a device that answered
        # discover_single but then times out or drops mid-update (rebooting,
        # a flaky Wi-Fi moment) must not crash the whole sweep via gather(); see
        # on_discovered's matching except below for the same reasoning.
        entry["reachable"] = False
        entry["error"] = str(exc)
    found.append(entry)


async def sweep_subnet(prefix: str, credentials: Credentials, timeout: float, found: list[dict], seen: set[str]) -> None:
    sem = asyncio.Semaphore(SWEEP_CONCURRENCY)

    async def bounded(ip: str) -> None:
        async with sem:
            await probe_host(ip, credentials, timeout, found, seen)

    await asyncio.gather(*(bounded(f"{prefix}.{i}") for i in range(1, 255)))


async def main() -> None:
    username, password, broadcast_timeout_s, probe_timeout_s = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
    subnets = sys.argv[5:]
    credentials = Credentials(username, password)
    found: list[dict] = []
    seen: set[str] = set()

    async def on_discovered(dev) -> None:
        if dev.host in seen:
            return
        seen.add(dev.host)
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
        discovery_timeout=broadcast_timeout_s,
        on_discovered=on_discovered,
    )

    for prefix in subnets:
        await sweep_subnet(prefix, credentials, probe_timeout_s, found, seen)

    print(json.dumps(found))


asyncio.run(main())

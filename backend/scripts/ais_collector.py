"""
scripts/ais_collector.py

OWNER: B3 (AIS & Attribution).
Start this day 1, check it Friday. Its value is purely elapsed time — do NOT
let it eat sprint hours. THE DEMO USES SYNTHETIC AIS (see app/attribution/synth.py),
not this collector (B3_ATTRIBUTION.md §6).

⚠️ Verify the bounding-box coordinate order against aisstream's docs before
trusting output — not confirmed whether it is [lat,lon] or [lon,lat]. Getting
it wrong yields a silently empty stream.

⚠️ Honest coverage limit: AIS is VHF, so a shore station hears roughly 40-70
nautical miles. Open-ocean coverage is thin to absent — exactly where
deliberate discharge happens. State plainly in the demo that operational
deployment needs satellite AIS.

Requires: AISSTREAM_KEY and PG_DSN environment variables (put them in .env,
which is gitignored — never commit a key).
"""

import asyncio
import importlib
import json
import os

from dotenv import load_dotenv
load_dotenv()

try:
    asyncpg = importlib.import_module("asyncpg")
except ImportError as exc:
    raise SystemExit(
        "install the 'asyncpg' package before running this collector"
    ) from exc

KEY = os.environ.get("AISSTREAM_KEY")
BBOX = [[[8.0, 68.0], [23.0, 78.0]]]        # [[lat,lon],[lat,lon]] -- VERIFY ORDER!

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS ais_positions (
  mmsi BIGINT, ts TIMESTAMPTZ, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
  sog REAL, cog REAL, heading REAL, name TEXT
);
CREATE INDEX IF NOT EXISTS ais_ts_idx   ON ais_positions (ts);
CREATE INDEX IF NOT EXISTS ais_mmsi_idx ON ais_positions (mmsi, ts);
"""


async def main():
    if not KEY:
        raise SystemExit("set AISSTREAM_KEY in your environment / .env first")

    try:
        websockets = importlib.import_module("websockets")
    except ImportError as exc:
        raise SystemExit(
            "install the 'websockets' package before running this collector"
        ) from exc

    pool = await asyncpg.create_pool(os.environ["PG_DSN"])
    async with pool.acquire() as con:
        await con.execute(CREATE_TABLE_SQL)

    async with websockets.connect("wss://stream.aisstream.io/v0/stream") as ws:
        await ws.send(json.dumps({
            "APIKey": KEY,
            "BoundingBoxes": BBOX,
            "FilterMessageTypes": ["PositionReport"],
        }))
        async for raw in ws:
            m = json.loads(raw)
            pr = m.get("Message", {}).get("PositionReport")
            if not pr:
                continue
            meta = m.get("MetaData", {})
            async with pool.acquire() as con:
                await con.execute(
                    """INSERT INTO ais_positions
                       (mmsi, ts, lat, lon, sog, cog, heading, name)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                       ON CONFLICT DO NOTHING""",
                    pr.get("UserID"), meta.get("time_utc"),
                    pr.get("Latitude"), pr.get("Longitude"),
                    pr.get("Sog"), pr.get("Cog"),
                    pr.get("TrueHeading"), (meta.get("ShipName") or "").strip())


if __name__ == "__main__":
    asyncio.run(main())

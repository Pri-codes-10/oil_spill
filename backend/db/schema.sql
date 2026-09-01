-- backend/db/schema.sql
--
-- OWNER: B3 (AIS & Attribution).
--
-- ais_positions is created automatically at runtime by scripts/ais_collector.py
-- (CREATE TABLE IF NOT EXISTS), but until now existed nowhere else in the repo
-- as a discoverable schema. This file is that reference copy -- keep the two
-- in sync if either changes.

CREATE TABLE IF NOT EXISTS ais_positions (
  mmsi     BIGINT,
  ts       TIMESTAMPTZ,
  lat      DOUBLE PRECISION,
  lon      DOUBLE PRECISION,
  sog      REAL,             -- speed over ground, knots
  cog      REAL,             -- course over ground, degrees
  heading  REAL,             -- true heading, degrees
  name     TEXT
);

CREATE INDEX IF NOT EXISTS ais_ts_idx   ON ais_positions (ts);
CREATE INDEX IF NOT EXISTS ais_mmsi_idx ON ais_positions (mmsi, ts);
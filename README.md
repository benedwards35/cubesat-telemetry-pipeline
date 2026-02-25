# CubeSat Telemetry Pipeline

A ground station telemetry pipeline that simulates receiving sensor data from a CubeSat, validates it, stores it in PostgreSQL, and exposes it via a Flask REST API.

Built as a portfolio project drawing on full-stack Python/Flask/REST API experience from a NASA Marshall Space Flight Center internship (Summer 2025).

---

## Architecture

```
emulator.py  ──►  receiver.py  ──►  PostgreSQL  ──►  api.py
                                     (telemetry      (REST API)
Generates fake     Validates via      database)
sensor packets     XOR checksum,
over TCP at        discards corrupt
10Hz with ~2%      packets, inserts
fault injection    clean data
```

The emulator and receiver are decoupled from the API — they communicate only through the database. This mirrors real ground station architecture where data ingest and data serving are separate concerns.

---

## Features

- **10Hz telemetry stream** simulating TEMP, HUMIDITY, and DISTANCE sensors
- **XOR checksum validation** — corrupt packets are logged and discarded before reaching the database
- **Fault injection** — ~2% of packets are intentionally corrupted (bad checksums) or contain anomalous sensor values, simulating real hardware failures
- **PostgreSQL persistence** with indexed storage
- **REST API** with four endpoints for querying telemetry data
- **ISO 8601 timestamps** on all API responses

---

## Tech Stack

- **Python 3.14** — emulator, receiver, API
- **Flask** — REST API framework
- **PostgreSQL** — telemetry storage
- **psycopg2** — PostgreSQL adapter
- **python-dotenv** — environment variable management
- **pyserial** — (ready for Arduino hardware integration, see below)

---

## Project Structure

```
cubesat-telemetry-pipeline/
├── emulator.py       # Simulates CubeSat sensor transmissions over TCP
├── receiver.py       # Validates packets, writes clean data to PostgreSQL
├── api.py            # Flask REST API
├── .env              # DB credentials (not committed)
├── .env.example      # Template for environment setup
└── .venv/            # Virtual environment
```

---

## Setup

### Prerequisites

- Python 3.10+
- PostgreSQL 14+

### 1. Clone and create virtual environment

```bash
git clone https://github.com/yourusername/cubesat-telemetry-pipeline.git
cd cubesat-telemetry-pipeline
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install flask psycopg2-binary python-dotenv pyserial
```

### 3. Create the database

```sql
CREATE DATABASE telemetry;

\c telemetry

CREATE TABLE packets (
    id          SERIAL PRIMARY KEY,
    timestamp   DOUBLE PRECISION NOT NULL,
    sensor_id   VARCHAR(20) NOT NULL,
    value       DOUBLE PRECISION NOT NULL,
    received_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Configure environment

Copy `.env.example` to `.env` and fill in your credentials:

```
DB_HOST=localhost
DB_NAME=telemetry
DB_USER=postgres
DB_PASSWORD=your_password_here
```

---

## Running the Pipeline

The pipeline requires three terminals running simultaneously:

**Terminal 1 — Start the emulator:**
```bash
python emulator.py
```

**Terminal 2 — Start the receiver:**
```bash
python receiver.py
```

**Terminal 3 — Start the API:**
```bash
python api.py
```

The emulator will wait for the receiver to connect before transmitting. Once all three are running, the API is available at `http://localhost:5000`.

---

## Packet Format

```
SAT|{timestamp}|{sensor_id}|{value}|{checksum}\n
```

Example:
```
SAT|1771978730.068|TEMP|22.14|3F
```

The checksum is computed as an XOR over all characters in the packet body (`SAT|timestamp|sensor_id|value`), formatted as a two-character hex string. The receiver recomputes this checksum on arrival and discards any packet where they don't match.

---

## REST API

### `GET /health`
Sanity check that the API is alive.

```json
{
  "service": "cubesat-telemetry-api",
  "status": "ok"
}
```

---

### `GET /telemetry/latest`
Most recent reading per sensor.

```bash
curl http://localhost:5000/telemetry/latest
```

```json
{
  "count": 3,
  "readings": [
    {"sensor_id": "DISTANCE", "value": 99.82,  "timestamp": "2026-02-25T02:01:16.922Z", "received_at": "2026-02-24T20:01:16.922Z"},
    {"sensor_id": "HUMIDITY", "value": 46.01,  "timestamp": "2026-02-25T02:01:16.922Z", "received_at": "2026-02-24T20:01:16.922Z"},
    {"sensor_id": "TEMP",     "value": 22.24,  "timestamp": "2026-02-25T02:01:16.920Z", "received_at": "2026-02-24T20:01:16.920Z"}
  ]
}
```

Uses PostgreSQL's `DISTINCT ON (sensor_id)` to efficiently return the single most recent row per sensor.

---

### `GET /telemetry/history`
All readings with optional filters.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sensor`  | string | none | Filter by sensor ID (`TEMP`, `HUMIDITY`, `DISTANCE`) |
| `limit`   | int | 100 | Max number of results (1–10000) |

```bash
curl "http://localhost:5000/telemetry/history?sensor=TEMP&limit=5"
```

```json
{
  "count": 5,
  "filters": {"sensor": "TEMP", "limit": 5},
  "readings": [...]
}
```

---

### `GET /telemetry/anomalies`
Readings outside normal operating range per sensor. Supports the same `sensor` and `limit` filters as `/history`.

| Sensor | Normal Range |
|--------|-------------|
| TEMP | 15.0 – 30.0 °C |
| HUMIDITY | 20.0 – 80.0 % |
| DISTANCE | 50.0 – 200.0 cm |

```bash
curl "http://localhost:5000/telemetry/anomalies"
```

```json
{
  "count": 3,
  "thresholds": {
    "TEMP":     {"min": 15.0, "max": 30.0},
    "HUMIDITY": {"min": 20.0, "max": 80.0},
    "DISTANCE": {"min": 50.0, "max": 200.0}
  },
  "anomalies": [...]
}
```

---

### `GET /telemetry/stats`
Aggregate statistics (min, avg, max, count) per sensor.

```bash
curl http://localhost:5000/telemetry/stats
```

```json
{
  "sensors": [
    {"sensor_id": "DISTANCE", "count": 1863, "min": "0.04",   "avg": "100.24", "max": "356.96"},
    {"sensor_id": "HUMIDITY", "count": 1864, "min": "-8.33",  "avg": "44.78",  "max": "112.13"},
    {"sensor_id": "TEMP",     "count": 1864, "min": "-17.92", "avg": "22.29",  "max": "78.47"}
  ]
}
```

---

## Sensor Normal Ranges

The emulator generates values around realistic base values with small noise and drift:

| Sensor | Base Value | Noise | Units |
|--------|-----------|-------|-------|
| TEMP | 22.0 | ±0.5 | °C |
| HUMIDITY | 45.0 | ±1.0 | % RH |
| DISTANCE | 100.0 | ±2.0 | cm |

---

## Fault Injection

The emulator injects faults at a ~2% rate per packet. Faults come in two forms:

**Corrupt packets (30% of faults):** Malformed structure that fails checksum validation. The receiver logs and discards these — they never reach the database. This simulates cosmic ray bit flips corrupting the transmission.

**Value spikes (70% of faults):** Valid packet structure and correct checksum, but wildly out-of-range sensor values. These pass validation and reach the database, where `/telemetry/anomalies` flags them. This simulates hardware sensor failures (radiation damage, power glitches).

---

## Upcoming: Arduino Hardware Integration

The ELEGOO Arduino Uno kit (arriving March 2026) will replace the software emulator with real sensor hardware:

- **DHT11** → TEMP and HUMIDITY readings
- **HC-SR04 ultrasonic sensor** → DISTANCE readings
- **pyserial** replaces the TCP socket connection in `receiver.py`

The receiver, database, and API require no changes — only the data source swaps out. This is an intentional design decision: the socket/serial interface is isolated in `receiver.py` so the rest of the pipeline is hardware-agnostic.

---

## Author

Ben Edwards — Junior CS student at Saint John's University (Collegeville, MN).  
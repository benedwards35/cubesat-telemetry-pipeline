import os
import psycopg2
import psycopg2.extras
from flask import Flask, jsonify, request, g
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

def get_db():
    if 'db' not in g:
        g.db = psycopg2.connect(
            host=os.getenv("DB_HOST", "localhost"),
            dbname=os.getenv("DB_NAME", "telemetry"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD")
        )
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()


@app.route('/health')
def health():
    return jsonify({"status": "ok", "service": "cubesat-telemetry-api"})

@app.route('/telemetry/latest')
def latest():
    db = get_db()
    
    with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT DISTINCT ON (sensor_id)
                sensor_id,
                value,
                timestamp,
                received_at
            FROM packets
            ORDER BY sensor_id, timestamp DESC
        """)
        rows = cur.fetchall()

    return jsonify({
        "count": len(rows),
        "readings": [dict(row) for row in rows]
    })

@app.route('/telemetry/history')
def history():
    sensor = request.args.get('sensor')        
    limit  = request.args.get('limit', 100)

    try:
        limit = int(limit)
        if limit < 1 or limit > 10000:
            raise ValueError
    except ValueError:
        return jsonify({"error": "limit must be an integer between 1 and 10000"}), 400

    conditions = []
    params = []

    if sensor:
        conditions.append("sensor_id = %s")
        params.append(sensor.upper())  

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    params.append(limit)

    db = get_db()
    with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"""
            SELECT sensor_id, value, timestamp, received_at
            FROM packets
            {where}
            ORDER BY timestamp DESC
            LIMIT %s
        """, params)
        rows = cur.fetchall()

    return jsonify({
        "count": len(rows),
        "filters": {"sensor": sensor, "limit": limit},
        "readings": [dict(row) for row in rows]
    })

ANOMALY_THRESHOLDS = {
    "TEMP":     {"min": 15.0,  "max": 30.0},
    "HUMIDITY": {"min": 20.0,  "max": 80.0},
    "DISTANCE": {"min": 50.0,  "max": 200.0},
}

@app.route('/telemetry/anomalies')
def anomalies():
    sensor = request.args.get('sensor')
    limit  = request.args.get('limit', 100)

    try:
        limit = int(limit)
        if limit < 1 or limit > 10000:
            raise ValueError
    except ValueError:
        return jsonify({"error": "limit must be an integer between 1 and 10000"}), 400

    threshold_clauses = []
    params = []
    for s_id, bounds in ANOMALY_THRESHOLDS.items():
        threshold_clauses.append(
            "(sensor_id = %s AND (value < %s OR value > %s))"
        )
        params.extend([s_id, bounds["min"], bounds["max"]])

    anomaly_where = "(" + " OR ".join(threshold_clauses) + ")"

    if sensor:
        anomaly_where += " AND sensor_id = %s"
        params.append(sensor.upper())

    params.append(limit)

    db = get_db()
    with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"""
            SELECT sensor_id, value, timestamp, received_at
            FROM packets
            WHERE {anomaly_where}
            ORDER BY timestamp DESC
            LIMIT %s
        """, params)
        rows = cur.fetchall()

    return jsonify({
        "count": len(rows),
        "thresholds": ANOMALY_THRESHOLDS,
        "filters": {"sensor": sensor, "limit": limit},
        "anomalies": [dict(row) for row in rows]
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
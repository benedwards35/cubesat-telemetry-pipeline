import socket
import psycopg2
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()


DB_CONFIG = {
    'dbname': 'telemetry',
    'user': 'postgres',
    'password': os.getenv('DB_PASSWORD'),
    'host': '127.0.0.1',
    'port': 5432
}

HOST = '127.0.0.1'
PORT = 65432

def checksum(data: str) -> str:
    result = 0
    for char in data:
        result ^= ord(char)
    return format(result, '02X')

def validate_packet(packet: str):
    parts = packet.strip().split('|')
    if len(parts) != 5:
        return None
    header, timestamp, sensor_id, value, received_checksum = parts
    if header != 'SAT':
        return None
    body = f"{header}|{timestamp}|{sensor_id}|{value}"
    if checksum(body) != received_checksum:
        return None
    try:
        return {
            'timestamp': float(timestamp),
            'sensor_id': sensor_id,
            'value': float(value)
        }
    except ValueError:
        return None

def insert_packet(cursor, packet):
    cursor.execute(
        "INSERT INTO packets (timestamp, sensor_id, value) VALUES (%s, %s, %s)",
        (packet['timestamp'], packet['sensor_id'], packet['value'])
    )

def run_receiver():
    print("Connecting to database...")
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    print("Database connected.")

    print(f"Connecting to emulator at {HOST}:{PORT}...")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((HOST, PORT))
        print("Connected to emulator. Receiving telemetry...\n")
        buffer = ""
        while True:
            data = s.recv(1024).decode('utf-8')
            if not data:
                print("Emulator disconnected.")
                break
            buffer += data
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                packet = validate_packet(line)
                if packet:
                    insert_packet(cursor, packet)
                    conn.commit()
                    print(f"[STORED] {packet}")
                else:
                    print(f"[DISCARDED] {line}")

if __name__ == '__main__':
    run_receiver()
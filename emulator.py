import socket
import time
import random
import struct

HOST = '127.0.0.1'
PORT = 65432
TRANSMIT_RATE = 0.1  # (10Hz)

SENSORS = {
    'TEMP':     {'base': 22.0,  'noise': 0.5,  'drift': 0.01},
    'HUMIDITY': {'base': 45.0,  'noise': 1.0,  'drift': 0.02},
    'DISTANCE': {'base': 100.0, 'noise': 2.0,  'drift': 0.05},
}

sensor_state = {k: v['base'] for k, v in SENSORS.items()}

def simulate_sensor(sensor_id):
    params = SENSORS[sensor_id]
    # Drift / Noise
    sensor_state[sensor_id] += params['drift'] * random.choice([-1, 1])
    value = sensor_state[sensor_id] + random.uniform(-params['noise'], params['noise'])
    return round(value, 2)

def checksum(data: str) -> str:
    result = 0
    for char in data:
        result ^= ord(char)
    return format(result, '02X')

def build_packet(sensor_id, value) -> str:
    timestamp = round(time.time(), 3)
    body = f"SAT|{timestamp}|{sensor_id}|{value}"
    cs = checksum(body)
    return f"{body}|{cs}\n"

def inject_fault(sensor_id=None, value=None):
    # Two Fault modes: 30% corrupt packet, 70% value spike
    if random.random() < 0.3:
        # Corrupt packet
        return "SAT|CORRUPTED|###\n"
    else:
        # Value spike
        s_id = sensor_id or random.choice(list(SENSORS.keys()))
        spike_ranges = {
            'TEMP':     lambda: random.choice([random.uniform(-20, 10), random.uniform(40, 80)]),
            'HUMIDITY': lambda: random.choice([random.uniform(-10, 10), random.uniform(90, 120)]),
            'DISTANCE': lambda: random.choice([random.uniform(0, 30),   random.uniform(220, 400)]),
        }
        spike_value = round(spike_ranges[s_id](), 2)
        timestamp = round(time.time(), 3)
        body = f"SAT|{timestamp}|{s_id}|{spike_value}"
        cs = checksum(body)
        print(f"[SPIKE INJECTED] {s_id} = {spike_value}")
        return f"{body}|{cs}\n"

def run_emulator():
    print(f"Starting telemetry emulator on {HOST}:{PORT}")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((HOST, PORT))
        server.listen(1)
        print("Waiting for receiver to connect...")
        conn, addr = server.accept()
        with conn:
            print(f"Receiver connected: {addr}")
            packet_count = 0
            while True:
                for sensor_id in SENSORS:
                    # 2% Fault Rate
                    if random.randint(1, 50) == 1:
                        packet = inject_fault(sensor_id)
                        print(f"[FAULT INJECTED] {packet.strip()}")
                    else:
                        value = simulate_sensor(sensor_id)
                        packet = build_packet(sensor_id, value)
                        print(f"[TX] {packet.strip()}")
                    conn.sendall(packet.encode('utf-8'))
                    packet_count += 1
                time.sleep(TRANSMIT_RATE)

if __name__ == '__main__':
    run_emulator()
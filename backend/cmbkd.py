from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import random

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import urllib.request
import time

STATION_COORDS = {
    "Maitri": {"lat": -70.7644, "lon": 11.7342},
    "Bharati": {"lat": -69.4069, "lon": 76.1956},
}

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(title="Dolphin Antarctic Crew Safety API", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sample crew data used by the local dashboard. A real wearable gateway can
# replace these values without changing the dashboard endpoints.
CREW = [
    {"id": "C-001", "name": "Tanusha P V", "role": "Research Scientist", "station": "Maitri", "zone": "Laboratory", "base_hr": 72, "base_spo2": 98, "base_temp": 36.7, "battery": 86, "device": "WRB-M-001", "x": 20, "y": 34},
    {"id": "C-007", "name": "Eshaan Sumeer", "role": "Meteorologist", "station": "Maitri", "zone": "Weather Lab", "base_hr": 76, "base_spo2": 97, "base_temp": 36.8, "battery": 74, "device": "WRB-M-007", "x": 38, "y": 28},
    {"id": "C-012", "name": "Manvitha Reddy", "role": "Engineer", "station": "Maitri", "zone": "Power Block", "base_hr": 88, "base_spo2": 95, "base_temp": 37.1, "battery": 61, "device": "WRB-M-012", "x": 45, "y": 61},
    {"id": "C-036", "name": "Ishita Das", "role": "Doctor", "station": "Maitri", "zone": "Medical Unit", "base_hr": 68, "base_spo2": 99, "base_temp": 36.5, "battery": 95, "device": "WRB-M-036", "x": 43, "y": 40},

    {"id": "C-017", "name": "Vikram Joshi", "role": "Field Researcher", "station": "Bharati", "zone": "Field Zone A", "base_hr": 96, "base_spo2": 92, "base_temp": 37.7, "battery": 43, "device": "WRB-B-017", "x": 84, "y": 72},
    {"id": "C-024", "name": "Arjun Mehta", "role": "Biologist", "station": "Bharati", "zone": "Research Block", "base_hr": 84, "base_spo2": 96, "base_temp": 37.2, "battery": 91, "device": "WRB-B-024", "x": 68, "y": 45},
    {"id": "C-031", "name": "Rushil", "role": "Logistics Officer", "station": "Bharati", "zone": "Storage", "base_hr": 70, "base_spo2": 98, "base_temp": 36.6, "battery": 78, "device": "WRB-B-031", "x": 73, "y": 68},
    {
    "id": "C-045",
    "name": "Altamash",
    "role": "Field Technician",
    "station": "Bharati",
    "zone": "Field Zone A",
    "base_hr": 82,
    "base_spo2": 96,
    "base_temp": 37.0,
    "battery": 67,
    "device": "WRB-B-045",
    "x": 80,
    "y": 85
},
    {"id": "C-041", "name": "Midhun", "role": "Technician", "station": "Bharati", "zone": "Vehicle Bay", "base_hr": 78, "base_spo2": 97, "base_temp": 36.8, "battery": 8, "device": "WRB-B-041", "x": 86, "y": 30},
]

ENVIRONMENT = {
    "Maitri": {"temperature": -21, "wind": 38, "visibility": 920, "condition": "Cold / Stable", "risk": 22},
    "Bharati": {"temperature": -28, "wind": 72, "visibility": 180, "condition": "Blizzard Risk", "risk": 72},
}
GEOFENCES = {
    "Maitri": [
        {
            "name": "Maitri Station Safe Zone",
            "x1": 7,
            "y1": 10,
            "x2": 55,
            "y2": 86,
            "type": "safe"
        }
    ],

    "Bharati": [
        {
            "name": "Bharati Station Safe Zone",
            "x1": 70,
            "y1": 60,
            "x2": 90,
            "y2": 85,
            "type": "safe"
        },
        {
            "name": "Bharati Field Zone A",
            "x1": 60,
            "y1": 55,
            "x2": 93,
            "y2": 97,
            "type": "authorized"
        }
    ],
}
ALERTS = [
    {"id": "A-104", "level": "critical", "type": "health", "crew": "C-017", "title": "Multiple abnormal readings", "detail": "SpO₂ below threshold with elevated heart rate.", "minutes": 2},
    {"id": "A-101", "level": "attention", "type": "health", "crew": "C-024", "title": "Health deviation detected", "detail": "Heart rate is above the individual baseline.", "minutes": 5},
    {"id": "A-098", "level": "warning", "type": "wearable", "crew": "C-041", "title": "Wearable offline", "detail": "Device battery is critically low and telemetry has stopped.", "minutes": 11},
    {"id": "A-095", "level": "warning", "type": "recovery", "crew": "C-012", "title": "Low recovery score", "detail": "Reduced sleep and elevated resting heart rate increase risk.", "minutes": 22},
]

ACKED = set()
SIMULATED_EVENTS = {}


def utc_now():
    return datetime.now(timezone.utc)


def find_crew_member(crew_id):
    return next((member for member in CREW if member["id"] == crew_id), None)


def current_geofence(member):
    for zone in GEOFENCES[member["station"]]:
        if zone["x1"] <= member["x"] <= zone["x2"] and zone["y1"] <= member["y"] <= zone["y2"]:
            return zone
    return {"name": "Outside configured zone", "type": "breach"}


def make_reading(member):
    seed = int(utc_now().timestamp() // 5) + sum(map(ord, member["id"]))
    rng = random.Random(seed)

    if member["id"] == "C-017":
        heart_rate = rng.randint(112, 128)
        spo2 = rng.randint(90, 93)
        temperature = round(rng.uniform(37.5, 38.3), 1)
        activity = rng.randint(8, 24)
    elif member["id"] in ("C-012", "C-024"):
        heart_rate = rng.randint(member["base_hr"] + 12, member["base_hr"] + 28)
        spo2 = rng.randint(94, 96)
        temperature = round(rng.uniform(37.1, 37.5), 1)
        activity = rng.randint(30, 60)
    elif member["id"] == "C-041":
        heart_rate = None
        spo2 = None
        temperature = None
        activity = 0
    else:
        heart_rate = max(55, min(105, member["base_hr"] + rng.randint(-6, 7)))
        spo2 = max(94, min(99, member["base_spo2"] + rng.choice([-1, 0, 0, 1])))
        temperature = round(member["base_temp"] + rng.uniform(-0.3, 0.3), 1)
        activity = rng.randint(55, 90)

    event = SIMULATED_EVENTS.get(member["id"])
    fall_detected = event == "fall"
    immobility_detected = event == "immobility"
    if fall_detected or immobility_detected:
        activity = 1

    deviations = []
    if heart_rate is not None and abs(heart_rate - member["base_hr"]) >= 20:
        deviations.append("heart rate")
    if spo2 is not None and spo2 <= 94:
        deviations.append("SpO₂")
    if temperature is not None and temperature >= member["base_temp"] + 0.6:
        deviations.append("temperature")
    if activity <= 15 and heart_rate is not None:
        deviations.append("activity")

    geofence = current_geofence(member)
    if geofence["type"] == "breach":
        deviations.append("geofence")

    environment_risk = ENVIRONMENT[member["station"]]["risk"]
    score = 100

    if heart_rate is not None:
        score -= min(25, abs(heart_rate - member["base_hr"]) * 0.65)
    if spo2 is not None:
        score -= max(0, (96 - spo2) * 7)
    if temperature is not None:
        score -= max(0, (temperature - (member["base_temp"] + 0.2)) * 18)

    score -= max(0, (25 - activity) * 0.6)
    score -= environment_risk * 0.12
    score -= 18 if geofence["type"] == "breach" else 0
    score -= 10 if member["battery"] < 15 else 0
    score -= 35 if fall_detected or immobility_detected else 0
    score = int(max(0, min(100, round(score))))

    if fall_detected or immobility_detected or score < 55:
        status = "critical"
    elif score < 82 or deviations:
        status = "attention"
    else:
        status = "safe"

    if member["id"] == "C-041":
        status = "offline"

    return {
        **member,
        "heart_rate": heart_rate,
        "spo2": spo2,
        "temperature": temperature,
        "activity": activity,
        "heart_rate_deviation": None if heart_rate is None else round(heart_rate - member["base_hr"], 1),
        "spo2_deviation": None if spo2 is None else round(spo2 - member["base_spo2"], 1),
        "temperature_deviation": None if temperature is None else round(temperature - member["base_temp"], 1),
        "deviations": deviations,
        "safety_score": score,
        "status": status,
        "geofence": geofence,
        "wearable_status": "offline" if status == "offline" else "connected",
        "fall_detected": fall_detected,
        "immobility_detected": immobility_detected,
        "environment_risk": environment_risk,
        "updated_at": utc_now().isoformat(),
    }


def make_history(member):
    rng = random.Random(sum(map(ord, member["id"])))
    start = utc_now() - timedelta(hours=23)
    points = []

    for hour in range(24):
        heart_rate = member["base_hr"] + rng.randint(-5, 5)
        spo2 = max(90, min(99, member["base_spo2"] + rng.choice([-1, 0, 0, 1])))
        safety = 96 - abs(heart_rate - member["base_hr"]) * 1.2
        safety -= max(0, 96 - spo2) * 4
        safety += rng.randint(-3, 3)

        points.append({
            "time": (start + timedelta(hours=hour)).isoformat(),
            "heart_rate": heart_rate,
            "spo2": spo2,
            "safety_score": max(45, min(99, round(safety, 1))),
        })

    return points


def make_timeline(member):
    reading = make_reading(member)
    events = [
        {"time": "06:30", "type": "shift", "title": "Shift started", "detail": "Station residence → operations"},
        {"time": "08:10", "type": "location", "title": "Entered work zone", "detail": f"Moved into {member['zone']}"},
        {"time": "10:25", "type": "wearable", "title": "Wearable telemetry received", "detail": f"{member['device']} connected"},
        {"time": "12:40", "type": "health", "title": "Health baseline check", "detail": f"HR {member['base_hr']} bpm · SpO₂ {member['base_spo2']}%"},
        {"time": "15:15", "type": "environment", "title": "Environment correlated", "detail": f"{member['station']} risk {ENVIRONMENT[member['station']]['risk']}/100"},
        {"time": "Now", "type": "location", "title": "Live position", "detail": f"{member['zone']} · {reading['geofence']['name']}"},
    ]

    if reading["fall_detected"]:
        events.insert(-1, {"time": "Now", "type": "emergency", "title": "Fall detection triggered", "detail": "Low movement event detected"})
    if reading["immobility_detected"]:
        events.insert(-1, {"time": "Now", "type": "emergency", "title": "Immobility detection triggered", "detail": "Movement below configured threshold"})

    return events


@app.get("/")
def home():
    return FileResponse(BASE_DIR / "crew/index.html")


@app.get("/api/health")
def api_health():
    return {"status": "online", "timestamp": utc_now().isoformat()}


@app.get("/api/crew")
def get_crew(station: Optional[str] = None):
    members = [
        make_reading(member)
        for member in CREW
        if not station or member["station"].lower() == station.lower()
    ]
    return {"crew": members, "updated_at": utc_now().isoformat()}


@app.get("/api/crew/{crew_id}")
def get_member(crew_id: str):
    member = find_crew_member(crew_id)
    if member is None:
        raise HTTPException(404, "Crew member not found")

    result = make_reading(member)
    result["baseline"] = {
        "heart_rate": member["base_hr"],
        "spo2": member["base_spo2"],
        "temperature": member["base_temp"],
    }
    result["history"] = make_history(member)
    result["timeline"] = make_timeline(member)
    return result


@app.get("/api/summary")
def get_summary():
    readings = [make_reading(member) for member in CREW]
    return {
        "total": len(readings),
        "safe": sum(item["status"] == "safe" for item in readings),
        "attention": sum(item["status"] == "attention" for item in readings),
        "critical": sum(item["status"] == "critical" for item in readings),
        "offline": sum(item["status"] == "offline" for item in readings),
        "connected": sum(item["wearable_status"] == "connected" for item in readings),
        "avg_safety_score": round(sum(item["safety_score"] for item in readings) / len(readings)),
    }

_env_cache = {"data": None, "expires": 0}
@app.get("/api/environment")
def get_environment():
    now = time.time()
    
    # Return cached data if still valid (15 mins = 900 seconds)
    if _env_cache["data"] and now < _env_cache["expires"]:
        print("From Cache")
        return _env_cache["data"]

    env = {}
    for name, data in ENVIRONMENT.items():
        coords = STATION_COORDS.get(name)
        if not coords:
            env[name] = data
            continue

        try:
            url = f"https://api.open-meteo.com/v1/forecast?latitude={coords['lat']}&longitude={coords['lon']}&current=temperature_2m,wind_speed_10m"
            with urllib.request.urlopen(url, timeout=3) as resp:
                import json
                res = json.loads(resp.read().decode())
                current = res.get("current", {})
                
                env[name] = {
                    **data,
                    "temperature": round(current.get("temperature_2m", data["temperature"])),
                    "wind": round(current.get("wind_speed_10m", data["wind"])),
                }
                print("Live Weather from Open-Meteo")
        except Exception:
            env[name] = data

    # Update cache and set expiry time
    _env_cache["data"] = env
    _env_cache["expires"] = now + 900

    return env


@app.get("/api/geofences")
def get_geofences():
    return GEOFENCES


@app.get("/api/history/{crew_id}")
def get_history(crew_id: str):
    member = find_crew_member(crew_id)
    if member is None:
        raise HTTPException(404, "Crew member not found")
    return {"crew_id": crew_id, "points": make_history(member)}


@app.get("/api/timeline/{crew_id}")
def get_timeline(crew_id: str):
    member = find_crew_member(crew_id)
    if member is None:
        raise HTTPException(404, "Crew member not found")
    return {"crew_id": crew_id, "events": make_timeline(member)}


@app.get("/api/alerts")
def get_alerts():
    alerts = []

    for alert in ALERTS:
        if alert["id"] in ACKED:
            continue

        member = find_crew_member(alert["crew"])
        age = "just now" if alert["minutes"] < 1 else f"{alert['minutes']} min ago"
        alerts.append({
            **alert,
            "crew_name": member["name"],
            "station": member["station"],
            "time": age,
        })

    for crew_id, event in SIMULATED_EVENTS.items():
        member = find_crew_member(crew_id)
        alerts.insert(0, {
            "id": f"SIM-{crew_id}-{event}",
            "level": "critical",
            "type": "emergency",
            "crew": crew_id,
            "crew_name": member["name"],
            "station": member["station"],
            "title": f"{event.title()} detected",
            "detail": "Emergency workflow active — operator verification required.",
            "time": "just now",
        })

    return {"alerts": alerts}


@app.post("/api/alerts/{alert_id}/ack")
def acknowledge_alert(alert_id: str):
    ACKED.add(alert_id)
    return {"ok": True}


@app.post("/api/crew/{crew_id}/simulate")
def simulate_event(crew_id: str, event: str):
    if find_crew_member(crew_id) is None:
        raise HTTPException(404, "Crew member not found")
    if event not in ("fall", "immobility", "clear"):
        raise HTTPException(400, "event must be fall, immobility, or clear")

    if event == "clear":
        SIMULATED_EVENTS.pop(crew_id, None)
    else:
        SIMULATED_EVENTS[crew_id] = event

    return {"ok": True, "event": event}


app.mount("/assets", StaticFiles(directory=BASE_DIR / "crew"), name="assets")

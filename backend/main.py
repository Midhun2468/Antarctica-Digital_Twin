from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
import re
import os
from datetime import datetime, timezone

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

STATIONS = {
    "maitri": {
        "name": "Maitri Research Station",
        "lat": -70.7644,
        "lon": 11.7342,
        "url": "https://data.ncpor.res.in/maitri/live"
    },
    "bharati": {
        "name": "Bharati Research Station",
        "lat": -69.4069,
        "lon": 76.1956,
        "url": "https://data.ncpor.res.in/bharati/live"
    }
}


class SimulationRequest(BaseModel):
    station: str
    start_date: str
    end_date: str
    temperature: float
    wind: float
    snowfall: float
    visibility: float
    storm: float


def extract_value(text, pattern):
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return float(match.group(1))
    return None


def get_open_meteo_hourly(station):
    data = STATIONS[station]
    url = (
        "https://api.open-meteo.com/v1/forecast?"
        f"latitude={data['lat']}&longitude={data['lon']}&"
        "hourly=temperature_2m,wind_speed_10m&forecast_days=2&timezone=UTC"
    )

    response = requests.get(url, timeout=10)
    response.raise_for_status()
    payload = response.json()
    hourly = payload.get("hourly", {})
    wind_values = hourly.get("wind_speed_10m", [])

    return {
        "time": hourly.get("time", [])[:24],
        "temperature": hourly.get("temperature_2m", [])[:24],
        "wind_speed": [round(value / 3.6, 2) for value in wind_values[:24]
                       if value is not None]
    }


def get_ncpor_weather(station):
    data = STATIONS[station]

    response = requests.get(
        data["url"],
        headers={
            "User-Agent": "Mozilla/5.0"
        },
        timeout=20
    )

    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    text = soup.get_text(" ", strip=True)

    temperature = extract_value(
        text,
        r"Temperature:\s*(-?\d+(?:\.\d+)?)\s*°?\s*C"
    )

    humidity = extract_value(
        text,
        r"Relative Humidity:\s*(\d+(?:\.\d+)?)\s*%"
    )

    pressure = extract_value(
        text,
        r"Air Pressure:\s*(\d+(?:\.\d+)?)\s*mBar"
    )

    wind_knots = extract_value(
        text,
        r"Wind Speed\s*(\d+(?:\.\d+)?)\s*knots"
    )

    date_match = re.search(
        r"(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*\|\s*Temperature",
        text
    )

    timestamp = date_match.group(1) if date_match else "Latest NCPOR observation"

    if temperature is None:
        raise HTTPException(
            status_code=502,
            detail="Could not extract weather data from NCPOR"
        )

    wind_ms = None

    if wind_knots is not None:
        wind_ms = round(wind_knots * 0.514444, 2)

    hourly = {
        "time": [],
        "temperature": [],
        "wind_speed": []
    }
    hourly_source = None

    try:
        hourly = get_open_meteo_hourly(station)
        hourly_source = "Open-Meteo forecast"
    except (requests.RequestException, ValueError, KeyError, TypeError):
        pass

    return {
        "station": station,
        "station_name": data["name"],
        "latitude": data["lat"],
        "longitude": data["lon"],
        "temperature": temperature,
        "humidity": humidity,
        "pressure": pressure,
        "wind_speed": wind_ms,
        "wind_speed_knots": wind_knots,
        "wind_direction": None,
        "timestamp": timestamp,
        "source": "NCPOR",
        "source_url": data["url"],
        "hourly": hourly,
        "hourly_source": hourly_source,
        "hourly_status": "Forecast/model data" if hourly_source else "Unavailable"
    }


def get_fallback_weather(station):
    data = STATIONS[station]
    defaults = {
        "maitri": {"temperature": -18.0, "humidity": 61.0, "pressure": 987.0, "wind_speed": 8.0},
        "bharati": {"temperature": -22.0, "humidity": 64.0, "pressure": 982.0, "wind_speed": 10.0}
    }
    current = defaults[station]
    now = datetime.now(timezone.utc)
    hourly = []

    for hour in range(24):
        timestamp = now.replace(minute=0, second=0, microsecond=0)
        timestamp = timestamp.replace(hour=(timestamp.hour + hour) % 24)
        hourly.append({
            "time": timestamp.isoformat(),
            "temperature": round(current["temperature"] + ((hour % 6) - 2.5) * 0.4, 1),
            "wind_speed": round(max(0, current["wind_speed"] + ((hour % 5) - 2) * 0.5), 1)
        })

    return {
        "station": station,
        "station_name": data["name"],
        "latitude": data["lat"],
        "longitude": data["lon"],
        **current,
        "timestamp": now.isoformat(),
        "source": "Fallback/model data",
        "source_url": data["url"],
        "hourly": {
            "time": [item["time"] for item in hourly],
            "temperature": [item["temperature"] for item in hourly],
            "wind_speed": [item["wind_speed"] for item in hourly]
        }
    }


@app.get("/api/status")
def status():
    return {
        "status": "Antarctic Digital Twin API running"
    }


@app.get("/api/config")
def config():
    return {
        "windy_api_key": os.getenv("WINDY_API_KEY", "")
    }


@app.get("/api/weather/{station}")
def get_weather(station: str):

    if station not in STATIONS:
        raise HTTPException(
            status_code=404,
            detail="Unknown station"
        )

    try:
        return get_ncpor_weather(station)

    except requests.RequestException as e:
        fallback = get_fallback_weather(station)
        fallback["error"] = f"NCPOR request failed: {str(e)}"
        return fallback

    except Exception as e:
        fallback = get_fallback_weather(station)
        fallback["error"] = f"NCPOR response could not be parsed: {str(e)}"
        return fallback


@app.post("/api/simulation")
def run_simulation(request: SimulationRequest):

    risk = 0

    if request.temperature <= -30:
        risk += 30
    elif request.temperature <= -20:
        risk += 20
    elif request.temperature <= -10:
        risk += 10

    if request.wind >= 80:
        risk += 25
    elif request.wind >= 50:
        risk += 15
    elif request.wind >= 30:
        risk += 8

    if request.snowfall >= 80:
        risk += 20
    elif request.snowfall >= 50:
        risk += 12
    elif request.snowfall >= 20:
        risk += 6

    if request.visibility <= 100:
        risk += 20
    elif request.visibility <= 500:
        risk += 12
    elif request.visibility <= 1000:
        risk += 5

    if request.storm >= 80:
        risk += 30
    elif request.storm >= 50:
        risk += 20
    elif request.storm >= 25:
        risk += 10

    risk = min(risk, 100)

    if risk >= 70:
        level = "Critical"
    elif risk >= 40:
        level = "High"
    elif risk >= 20:
        level = "Moderate"
    else:
        level = "Low"

    return {
        "station": request.station,
        "start_date": request.start_date,
        "end_date": request.end_date,
        "risk": risk,
        "risk_level": level,
        "message": f"Environmental risk: {level}"
    }


frontend_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend")
)

app.mount(
    "/",
    StaticFiles(
        directory=frontend_path,
        html=True
    ),
    name="frontend"
)
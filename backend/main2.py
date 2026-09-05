from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
import re
import os

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


def get_ncpor_weather(station):
    data = STATIONS[station]

    # Include hourly forecast arrays for Chart.js rendering
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={data['lat']}&longitude={data['lon']}&"
        f"current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&"
        f"hourly=temperature_2m,wind_speed_10m"
    )

    response = requests.get(url, timeout=10)
    response.raise_for_status()
    payload = response.json()
    
    current = payload.get("current", {})
    hourly_data = payload.get("hourly", {})

    wind_kmh = current.get("wind_speed_10m")
    wind_knots = round(wind_kmh * 0.539957, 2) if wind_kmh is not None else None
    wind_ms = round(wind_kmh / 3.6, 2) if wind_kmh is not None else None

    # Convert km/h to m/s for hourly chart points
    hourly_wind_ms = [round(w / 3.6, 2) for w in hourly_data.get("wind_speed_10m", [])]

    return {
        "station": station,
        "station_name": data["name"],
        "latitude": data["lat"],
        "longitude": data["lon"],
        "temperature": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "pressure": current.get("surface_pressure"),
        "wind_speed": wind_ms,
        "wind_speed_knots": wind_knots,
        "wind_direction": current.get("wind_direction_10m"),
        "timestamp": current.get("time", "Latest Open-Meteo observation"),
        "source": "Open-Meteo",
        "source_url": url,
        "hourly": {
            "time": hourly_data.get("time", []),
            "temperature": hourly_data.get("temperature_2m", []),
            "wind_speed": hourly_wind_ms
        }
    }

@app.get("/api/status")
def status():
    return {
        "status": "Antarctic Digital Twin API running"
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
        raise HTTPException(
            status_code=502,
            detail=f"NCPOR request failed: {str(e)}"
        )

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Weather processing failed: {str(e)}"
        )


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
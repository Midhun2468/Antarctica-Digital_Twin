from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import requests
import os
from datetime import datetime, timezone

app = FastAPI()

frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

if frontend_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=frontend_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Accept", "Content-Type"]
    )
else:
    # Permissive fallback for development when FRONTEND_ORIGINS is not set
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )


@app.middleware("http")
async def disable_heuristic_caching(request, call_next):
    """Force revalidation of static assets and API responses.

    StaticFiles does not send a Cache-Control header, so browsers fall back to
    heuristic caching: a previously downloaded script.js can keep being reused
    without revalidating against the server. That makes frontend edits appear to
    have no effect until the user performs a hard refresh. Sending "no-cache"
    makes the browser revalidate on every request, which still returns a cheap
    304 response when the file is unchanged.
    """
    response = await call_next(request)

    content_type = response.headers.get("content-type", "")
    if (
        "text/html" in content_type
        or "javascript" in content_type
        or "text/css" in content_type
        or "application/json" in content_type
    ):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"

    return response

STATIONS = {
    "maitri": {
        "name": "Maitri Research Station",
        "lat": -70.7644,
        "lon": 11.7342
    },
    "bharati": {
        "name": "Bharati Research Station",
        "lat": -69.4069,
        "lon": 76.1956
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

class ChatRequest(BaseModel):
    message: str
    station: str = "maitri"
    context: dict = {}

def get_open_meteo_weather(station):
    """Fetch the current observation and hourly forecast from Open-Meteo."""
    data = STATIONS[station]

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={data['lat']}&longitude={data['lon']}&"
        f"current=temperature_2m,relative_humidity_2m,surface_pressure,"
        f"wind_speed_10m,wind_direction_10m,wind_gusts_10m,"
        f"precipitation,snowfall,weather_code,visibility&"
        f"hourly=temperature_2m,wind_speed_10m&timezone=UTC"
    )

    response = requests.get(url, timeout=10)
    response.raise_for_status()
    payload = response.json()

    current = payload.get("current", {})
    hourly_data = payload.get("hourly", {})

    wind_kmh = current.get("wind_speed_10m")
    gust_kmh = current.get("wind_gusts_10m")
    wind_knots = round(wind_kmh * 0.539957, 2) if wind_kmh is not None else None
    wind_ms = round(wind_kmh / 3.6, 2) if wind_kmh is not None else None
    gust_ms = round(gust_kmh / 3.6, 2) if gust_kmh is not None else None

    # Visibility is reported by Open-Meteo in metres.
    visibility_m = current.get("visibility")
    visibility_km = (
        round(visibility_m / 1000, 1) if visibility_m is not None else None
    )

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
        "wind_gusts": gust_ms,
        "precipitation": current.get("precipitation"),
        "snowfall": current.get("snowfall"),
        "weather_code": current.get("weather_code"),
        "visibility": visibility_m,
        "visibility_km": visibility_km,
        "timestamp": current.get("time", "Latest Open-Meteo observation"),
        "source": "Open-Meteo",
        "source_url": url,
        "hourly_source": "Open-Meteo forecast",
        "hourly": {
            "time": hourly_data.get("time", []),
            "temperature": hourly_data.get("temperature_2m", []),
            "wind_speed": hourly_wind_ms
        }
    }


def get_fallback_weather(station):
    """Modelled data used only when the live Open-Meteo request fails."""
    data = STATIONS[station]
    defaults = {
        "maitri": {
            "temperature": -18.0,
            "humidity": 61.0,
            "pressure": 987.0,
            "wind_speed": 8.0,
            "wind_direction": 70.0,
            "wind_gusts": 12.8,
            "precipitation": 0.2,
            "snowfall": 0.2,
            "weather_code": 71,
            "visibility": 8000.0
        },
        "bharati": {
            "temperature": -22.0,
            "humidity": 64.0,
            "pressure": 982.0,
            "wind_speed": 10.0,
            "wind_direction": 195.0,
            "wind_gusts": 16.0,
            "precipitation": 0.1,
            "snowfall": 0.1,
            "weather_code": 71,
            "visibility": 10000.0
        }
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
        "wind_speed_knots": round(current["wind_speed"] * 1.943844, 2),
        "visibility_km": round(current["visibility"] / 1000, 1),
        "timestamp": now.isoformat(),
        "source": "Fallback/model data",
        "source_url": "https://open-meteo.com/",
        "hourly_source": "Fallback/model data",
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
        return get_open_meteo_weather(station)

    except requests.RequestException as e:
        fallback = get_fallback_weather(station)
        fallback["error"] = f"Open-Meteo request failed: {str(e)}"
        return fallback

    except Exception as e:
        fallback = get_fallback_weather(station)
        fallback["error"] = f"Open-Meteo response could not be parsed: {str(e)}"
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

@app.post("/api/chat")
def chat_endpoint(request: ChatRequest):
    try:
        live_data = get_weather(request.station)
    except Exception:
        live_data = get_fallback_weather(request.station)

    msg = request.message.lower().strip()

    # 1. LOCAL ROUTING: Answer predictable queries without calling Gemini
    if any(k in msg for k in ["weather", "temperature", "wind", "temp"]):
        return {
            "reply": f"Observed weather at {live_data['station_name']}: "
                     f"Temperature is {live_data['temperature']}°C, "
                     f"Wind Speed is {live_data['wind_speed']} m/s, "
                     f"and Pressure is {live_data['pressure']} hPa."
        }

    if any(k in msg for k in ["logistics", "fuel", "resupply", "stock"]):
        stock = request.context.get("weather", {})
        return {
            "reply": f"Logistics overview for {live_data['station_name']}: "
                     f"Live temperature ({live_data['temperature']}°C) and wind ({live_data['wind_speed']} m/s) "
                     f"are being evaluated against station supply reserves."
        }

    # 2. FALLBACK: Send to Gemini only for complex, unstructured prompts
    api_key = os.getenv("GOOGLE_API_KEY", "")
    if not api_key:
        return {"reply": "Error: GEMINI_API_KEY environment variable is not set."}

    system_prompt = (
        f"You are Penguin, the chatbot.\n"
        f"Telemetry: {live_data}\n"
        f"Context: {request.context}\n"
        f"Answer with very short sentences and short points (maximum 4 points)"
    )

    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": f"{system_prompt}\nUser Question: {request.message}"}]}],
        "generationConfig": {"maxOutputTokens": 200}
    }

    try:
        res = requests.post(gemini_url, json=payload, timeout=15)
        data = res.json()
        if res.status_code != 200:
            return {"reply": f"API Error ({res.status_code}): {data.get('error', {}).get('message', 'Rate limited or error')}"}

        reply_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return {"reply": reply_text}
    except Exception as e:
        return {"reply": f"Internal exception: {str(e)}"}
    
app.mount(
    "/",
    StaticFiles(
        directory=frontend_path,
        html=True
    ),
    name="frontend"
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000"))
    )
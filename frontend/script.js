const stations = {
    maitri: {
        name: "Maitri Research Station",
        code: "MAITRI",
        lat: -70.7644,
        lon: 11.7342
    },
    bharati: {
        name: "Bharati Research Station",
        code: "BHARATI",
        lat: -69.4069,
        lon: 76.1956
    }
};

let currentStation = "maitri";
let map;
let stationMarker;
let openMeteoForecastLayer;
let earlyWarningMapLayer = null;
let weatherArea;
let weatherChart;

let latestWeather = null;
let stationInfrastructure = [];
const infrastructureStorageKey = "antarcticStationInfrastructure";

// Station logistics reserves used by the logistics projection. These values
// used to be read from the simulation planning inputs, which were removed
// together with the simulation tab, so they are now station constants.
const stationLogisticsBaseline = {
    personnel: 45,
    fuelStock: 10000,
    dailyFuelUse: 350,
    foodStock: 3000,
    waterStock: 6000,
    medicalStock: 500
};

let windyAPI = null;
let windyInitialized = false;
let windyInitializing = false;
let windyConfigLoaded = false;
let WINDY_API_KEY = "";
let selectedEnvironmentLayer = "temperature";
let windyEmbedActive = false;

let energy3DScene = null;
let energy3DCamera = null;
let energy3DRenderer = null;
let energy3DControls = null;
let energy3DRaycaster = null;
let energy3DMouse = null;
let energy3DGroup = null;
let energy3DInitialized = false;
let energy3DObjects = [];
let energy3DHovered = null;
let energy3DState = null;
let energy3DSelectedSource = null;
let energy3DFlows = [];
let energy3DWindRotors = [];
let energy3DClock = null;

let energyBalanceChart = null;

// Baseline energy constants are declared with the other top-level state so
// the synchronous startup calls below (updateStationInformation -> loadWeather
// -> updateEnergyDashboard) never read them before initialization.
const energySourceDefinitions = {
    solar: {
        id: "solar",
        name: "Solar Power",
        icon: "☀",
        unit: "kW",
        color: 0xf0b64b
    },
    wind: {
        id: "wind",
        name: "Wind Power",
        icon: "≋",
        unit: "kW",
        color: 0x63b8d8
    },
    diesel: {
        id: "diesel",
        name: "Diesel Generator",
        icon: "⚙",
        unit: "kW",
        color: 0xd98f4a
    },
    battery: {
        id: "battery",
        name: "Battery Storage",
        icon: "▮",
        unit: "kW",
        color: 0x6fa87a
    }
};

// Capacity that the digital twin always models, in addition to the
// power sources installed from the energy panel.
const stationEnergyBaseline = {
    solar: 46,
    wind: 38,
    diesel: 60,
    battery: 260,
    load: 52
};

// Energy condition simulation state is declared with the other top-level
// state because the synchronous startup path reaches it:
//   updateStationInformation -> loadWeather -> updateEnergyDashboard
//     -> renderEnergyAnalysis -> updateEnergyScenarioConditions
//     -> updateEnergyChart -> updateEnergyScenarioChart
// If these were declared further down the file they would still be in the
// temporal dead zone when that path runs, throwing a ReferenceError that
// silently aborts the initial weather load.
const energyScenarioDefinitions = {
    normal: { label: "Normal Conditions", temperature: null, wind: null, solarFactor: 1, windFactor: 1, loadExtraKw: 0, snowfall: "None", storm: "Calm" },
    lowSun: { label: "Low Sunlight", temperature: -2, wind: null, solarFactor: 0.25, windFactor: 1, loadExtraKw: 1.5, snowfall: "Light", storm: "Calm" },
    highWind: { label: "High Winds", temperature: -3, wind: 17, solarFactor: 0.85, windFactor: 1, loadExtraKw: 3, snowfall: "Light", storm: "Moderate" },
    heavySnow: { label: "Heavy Snowfall", temperature: -4, wind: null, solarFactor: 0.35, windFactor: 0.9, loadExtraKw: 3.5, snowfall: "Heavy", storm: "Moderate" },
    extremeCold: { label: "Extreme Cold", temperature: -42, wind: null, solarFactor: 0.9, windFactor: 1, loadExtraKw: 9, snowfall: "Light", storm: "Calm" },
    severeStorm: { label: "Severe Storm", temperature: -8, wind: 27, solarFactor: 0.15, windFactor: 1, loadExtraKw: 8, snowfall: "Heavy", storm: "Severe" },
    combined: { label: "Combined Extreme Conditions", temperature: -45, wind: 28, solarFactor: 0.1, windFactor: 1, loadExtraKw: 14, snowfall: "Heavy", storm: "Extreme" }
};

let hasRunEnergySimulation = false;
let lastEnergySimulation = null;

const stationSelect = document.getElementById("station");
const API_BASE_URL = (window.API_BASE_URL || "").replace(/\/+$/, "");

function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
}

function loadStationInfrastructure() {
    try {
        const stored = JSON.parse(localStorage.getItem(infrastructureStorageKey) || "{}");
        const assets = stored[currentStation];
        stationInfrastructure = Array.isArray(assets) ? assets : [];
    } catch (error) {
        stationInfrastructure = [];
    }
}

function saveStationInfrastructure() {
    try {
        const stored = JSON.parse(localStorage.getItem(infrastructureStorageKey) || "{}");
        stored[currentStation] = stationInfrastructure;
        localStorage.setItem(infrastructureStorageKey, JSON.stringify(stored));
    } catch (error) {
        // Health monitoring continues in memory if browser storage is unavailable.
    }
}

const stationName = document.getElementById("mapStationName");
const weatherStationName = document.getElementById("weatherStationName");
const weatherStationCode = document.getElementById("weatherStationCode");

const stationLatitude = document.getElementById("stationLatitude");
const stationLongitude = document.getElementById("stationLongitude");

const mapLatitude = document.getElementById("mapLatitude");
const mapLongitude = document.getElementById("mapLongitude");

const liveTemperature = document.getElementById("liveTemperature");
const liveWind = document.getElementById("liveWind");
const livePressure = document.getElementById("livePressure");
const liveHumidity = document.getElementById("liveHumidity");
const weatherTimestamp = document.getElementById("weatherTimestamp");

const mapDataStatus = document.getElementById("mapDataStatus");

const iconButtons = document.querySelectorAll(".icon-button");
const panels = document.querySelectorAll(".panel-content");
const closeButtons = document.querySelectorAll(".close-panel");

const layerButtons = document.querySelectorAll(".layer-button");
const selectedLayerName = document.getElementById("selectedLayerName");
const selectedLayerDescription = document.getElementById("selectedLayerDescription");

const layerDescriptions = {
    temperature: "Displays the current temperature conditions around the station.",
    wind: "Displays current wind speed and direction around the station.",
    snow: "Displays snowfall conditions around the station.",
    visibility: "Displays visibility conditions affecting station operations.",
    storm: "Displays the simulated severity of Antarctic storms.",
    pressure: "Displays atmospheric pressure around the station."
};

function coordinate(value, positive, negative) {
    return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

function initializeMap() {
    const mapContainer = document.getElementById("map");

    if (!mapContainer) {
        console.error("Map container #map not found");
        return;
    }

    if (map) {
        return;
    }

    const data = stations[currentStation];

    map = L.map(mapContainer, {
        zoomControl: true,
        minZoom: 2,
        maxZoom: 12
    }).setView([data.lat, data.lon], 5);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(map);

    updateMap();
}

function createStationIcon() {
    return L.divIcon({
        className: "custom-station-marker",
        html: `
            <div class="station-marker-ring">
                <div class="station-marker-dot"></div>
            </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

function updateMap() {
    if (!map) {
        return;
    }

    const data = stations[currentStation];

    map.setView([data.lat, data.lon], 5);

    if (stationMarker) {
        stationMarker.remove();
    }

    stationMarker = L.marker(
        [data.lat, data.lon],
        {
            icon: createStationIcon()
        }
    ).addTo(map);

    stationMarker.bindPopup(`
        <strong>${data.name}</strong><br>
        ${data.code}<br>
        ${coordinate(data.lat, "N", "S")}<br>
        ${coordinate(data.lon, "E", "W")}
    `);

}

function clearOpenMeteoForecastLayer() {
    if (openMeteoForecastLayer && map) {
        map.removeLayer(openMeteoForecastLayer);
    }

    openMeteoForecastLayer = null;
}

function updateOpenMeteoMapLayer(weather) {
    if (!map || !weather) {
        return;
    }

    const times = weather.hourly?.time || [];
    const temperatures = weather.hourly?.temperature || [];
    const winds = weather.hourly?.wind_speed || [];
    const temperature = Number(temperatures[0] ?? weather.temperature);
    const wind = Number(winds[0] ?? weather.wind_speed);

    if (!Number.isFinite(temperature) || !Number.isFinite(wind)) {
        clearOpenMeteoForecastLayer();
        return;
    }

    clearOpenMeteoForecastLayer();

    const position = getCurrentStationPosition();
    const forecastColor = temperature <= -25 ? "#4f8fc1" : temperature <= -15 ? "#6dabc5" : "#d58a5b";
    const forecastLabel = times[0]
        ? new Date(times[0]).toISOString().replace("T", " ").slice(0, 16) + " UTC"
        : "Current Open-Meteo forecast";

    openMeteoForecastLayer = L.layerGroup([
        L.circle(position, {
            radius: 24000,
            color: forecastColor,
            fillColor: forecastColor,
            fillOpacity: 0.16,
            weight: 2,
            dashArray: "6 5"
        }),
        L.circleMarker(position, {
            radius: 7,
            color: forecastColor,
            fillColor: forecastColor,
            fillOpacity: 0.85,
            weight: 2
        })
    ]).addTo(map);

    openMeteoForecastLayer.bindPopup(
        `<strong>Open-Meteo forecast</strong><br>` +
        `${forecastLabel}<br>` +
        `Temperature: ${temperature.toFixed(1)} °C<br>` +
        `Wind: ${wind.toFixed(1)} m/s`
    );
}


function updateStationInformation() {
    const data = stations[currentStation];

    stationName.textContent = data.name;
    weatherStationName.textContent = data.name;
    weatherStationCode.textContent = data.code;

    const lat = coordinate(data.lat, "N", "S");
    const lon = coordinate(data.lon, "E", "W");

    stationLatitude.textContent = lat;
    stationLongitude.textContent = lon;

    mapLatitude.textContent = lat;
    mapLongitude.textContent = lon;

    updateMap();
    updateWindyStation();
    loadWeather();
}

async function loadWeather() {
    const data = stations[currentStation];
    const weatherUrl = apiUrl(`/api/weather/${currentStation}`);

    latestWeather = null;
    liveTemperature.textContent = "--";
    liveWind.textContent = "--";
    livePressure.textContent = "--";
    liveHumidity.textContent = "--";
    weatherTimestamp.textContent = "Loading...";
    updateEnergyDashboard();

    if (mapDataStatus) {
        mapDataStatus.textContent = "Connecting to weather data";
    }

    try {
        console.debug("Loading station weather:", weatherUrl);
        const response = await fetch(
            weatherUrl,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        if (!response.ok) {
            throw new Error("Weather API error");
        }

        const weather = await response.json();
        const requiredWeatherValues = [
            weather.temperature,
            weather.wind_speed,
            weather.pressure,
            weather.humidity
        ];
        // Check for null/undefined values first (Number(null) === 0 which is finite!)
        if (requiredWeatherValues.some(value => value === null || value === undefined)) {
            throw new Error("Weather API returned null or undefined values");
        }
        if (!requiredWeatherValues.every(value => Number.isFinite(Number(value)))) {
            throw new Error("Weather API returned incomplete or non-numeric weather data");
        }
        latestWeather = weather;

        updateWeatherVisualization(weather);

        liveTemperature.textContent =
            formatNumber(weather.temperature);

        liveWind.textContent =
            formatNumber(weather.wind_speed);

        livePressure.textContent =
            formatNumber(weather.pressure);

        liveHumidity.textContent =
            formatNumber(weather.humidity);

        weatherTimestamp.textContent =
            weather.timestamp || "--";

        if (mapDataStatus) {
            mapDataStatus.textContent = weather.source === "Open-Meteo"
                ? "Open-Meteo real-time observation"
                : weather.source === "Fallback/model data"
                    ? "Open-Meteo unavailable - fallback/model data"
                    : "Weather source unavailable - fallback/model data";
        }

        updateWeatherChart(weather.hourly, weather);
        updateOpenMeteoMapLayer(weather);
        updateEnergyDashboard();
        updateEarlyWarningSystem();

        updateLogistics();
        const activeLayer = document.querySelector(".layer-button.active")?.dataset.layer;
        if (activeLayer) {
            applyMapLayer(activeLayer === "snow" ? "snowfall" : activeLayer);
        }

    } catch (error) {
        console.error("Weather API request failed:", {
            url: weatherUrl,
            station: currentStation,
            error
        });
        latestWeather = null;
        clearOpenMeteoForecastLayer();
        updateWeatherVisualization(null);
        updateWeatherChart(null);
        updateEnergyDashboard();
        updateEarlyWarningSystem();
        liveTemperature.textContent = "--";
        liveWind.textContent = "--";
        livePressure.textContent = "--";
        liveHumidity.textContent = "--";
        weatherTimestamp.textContent = "Unavailable";

        if (mapDataStatus) {
            mapDataStatus.textContent = "Weather data unavailable";
        }
    }
}

function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
        return "--";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toFixed(1);
}


function updateWeatherVisualization(weather) {
    const data = weather || {};
    const station = stations[currentStation];
    const source = data.source || "Weather data unavailable";
    const isObservation = source === "Open-Meteo";
    const temperature = Number(data.temperature);
    const wind = Number(data.wind_speed);
    const pressure = Number(data.pressure);
    const humidity = Number(data.humidity);
    const values = {
        visualWeatherStation: station.name,
        visualWeatherStatus: isObservation ? "Open-Meteo observation" : source,
        visualWeatherTimestamp: data.timestamp || "No observation timestamp available",
        visualWeatherTemperature: `${formatNumber(temperature)} °C`,
        visualWeatherWind: `${formatNumber(wind)} m/s`,
        visualWeatherPressure: `${formatNumber(pressure)} hPa`,
        visualWeatherHumidity: `${formatNumber(humidity)} %`
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    const operational = document.getElementById("visualWeatherOperational");
    const detail = document.getElementById("visualWeatherOperationalDetail");
    if (!operational || !detail) return;

    if (!Number.isFinite(temperature) || !Number.isFinite(wind)) {
        operational.textContent = "Awaiting weather data";
        detail.textContent = "Conditions will be summarized when the station response arrives.";
        return;
    }

    const cold = temperature <= -25;
    const windy = wind >= 18;
    operational.textContent = cold || windy ? "Heightened operating constraints" : "Routine operating conditions";
    detail.textContent = cold && windy
        ? "Low temperature and elevated wind may constrain outdoor work and transport."
        : cold
            ? "Low temperature increases heating demand and limits outdoor exposure."
            : windy
                ? "Elevated wind may reduce transport availability and outdoor work windows."
                : "Current observed conditions are within the normal operating range for this station.";
}

function updateWeatherChart(hourly, observation = latestWeather) {
    const canvas = document.getElementById("weatherChart");
    const emptyState = document.getElementById("weatherChartEmpty");
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    const temperatures = Array.isArray(hourly?.temperature) ? hourly.temperature : [];
    const winds = Array.isArray(hourly?.wind_speed) ? hourly.wind_speed : [];
    const validPoints = Math.min(times.length, temperatures.length, winds.length);
    const currentTemperature = Number(observation?.temperature);
    const currentWind = Number(observation?.wind_speed);
    const hasCurrentObservation = Number.isFinite(currentTemperature) && Number.isFinite(currentWind);

    if (!canvas) return;

    if (weatherChart) {
        weatherChart.destroy();
        weatherChart = null;
    }

    if (validPoints === 0 && !hasCurrentObservation) {
        canvas.classList.add("hidden");
        emptyState?.classList.remove("hidden");
        return;
    }

    canvas.classList.remove("hidden");
    emptyState?.classList.add("hidden");

    const timelineStatus = document.getElementById("weatherTimelineStatus");
    if (timelineStatus) {
        timelineStatus.textContent = validPoints > 0
            ? (observation?.hourly_source || "FORECAST")
            : "CURRENT OBSERVATION";
    }

    const labels = validPoints > 0 ? times.slice(0, 24).map(value => {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
    }) : ["Now"];

    const temperatureData = validPoints > 0
        ? temperatures.slice(0, 24).map(Number)
        : [currentTemperature];

    const windData = validPoints > 0
        ? winds.slice(0, 24).map(Number)
        : [currentWind];

    weatherChart = new Chart(canvas, {
        type: "line",

        data: {
            labels,

            datasets: [
                {
                    label: "Temperature °C",
                    data: temperatureData,
                    borderWidth: 2,
                    pointRadius: 1.5,
                    tension: 0.3
                },
                {
                    label: "Wind m/s",
                    data: windData,
                    borderWidth: 2,
                    pointRadius: 1.5,
                    tension: 0.3
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            plugins: {
                legend: {
                    display: true,

                    labels: {
                        boxWidth: 9,
                        font: {
                            size: 9
                        }
                    }
                }
            },

            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 8,
                        font: {
                            size: 8
                        }
                    },

                    grid: {
                        display: false
                    }
                },

                y: {
                    ticks: {
                        font: {
                            size: 8
                        }
                    }
                }
            }
        }
    });
}

stationSelect.addEventListener("change", () => {
    saveStationInfrastructure();
    currentStation = stationSelect.value;
    loadStationInfrastructure();
    updateStationInformation();
});

const visualizationContents =
    document.querySelectorAll(".visualization-content");

function updateVisualizationPanel(panelId) {
    visualizationContents.forEach(item => {
        item.classList.add("hidden");
    });

    if (panelId === "weatherPanel") {
        document.getElementById("weatherVisualization")
            ?.classList.remove("hidden");
    }

    if (panelId === "logisticsPanel") {
        document.getElementById("logisticsVisualization")
            ?.classList.remove("hidden");
    }

    if (panelId === "energyPanel") {
        document.getElementById("energyVisualization")
            ?.classList.remove("hidden");
    }

}

function setEnvironmentMapVisible(visible) {
    const mapArea = document.querySelector(".map-area");
    if (!mapArea) {
        return;
    }

    if (map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

function setEnvironmentStatus(message, source = "Windy Map Forecast API") {
    if (mapDataStatus) {
        mapDataStatus.textContent = `${message} (${source})`;
    }
}

async function loadWindyConfig() {
    if (windyConfigLoaded) {
        return WINDY_API_KEY;
    }

    windyConfigLoaded = true;
    try {
        const response = await fetch(apiUrl("/api/config"), { headers: { "Accept": "application/json" } });
        if (response.ok) {
            const config = await response.json();
            WINDY_API_KEY = typeof config.windy_api_key === "string"
                ? config.windy_api_key.trim()
                : "";
        }
    } catch (error) {
        WINDY_API_KEY = "";
    }

    return WINDY_API_KEY;
}

function showLeafletEnvironmentFallback() {
    const container = document.getElementById("windy");
    if (!container) return;

    const data = stations[currentStation];
    const overlay = selectedEnvironmentLayer === "snowfall"
        ? "rainAccu"
        : selectedEnvironmentLayer === "temperature"
            ? "temp"
            : selectedEnvironmentLayer === "pressure"
                ? "pressure"
                : "wind";
    const params = new URLSearchParams({
        lat: String(data.lat),
        lon: String(data.lon),
        detailLat: String(data.lat),
        detailLon: String(data.lon),
        zoom: "5",
        level: "surface",
        overlay,
        product: "ecmwf",
        menu: "true",
        message: "true",
        marker: "true",
        calendar: "now",
        pressure: "true",
        type: "map",
        location: "coordinates",
        detail: "true",
        metricWind: "default",
        metricTemp: "default"
    });

    const frame = document.createElement("iframe");
    frame.title = "Windy.com Antarctic weather map";
    frame.setAttribute("aria-label", "Interactive Windy.com Antarctic weather map");
    frame.src = `https://embed.windy.com/embed2.html?${params.toString()}`;
    container.replaceChildren(frame);
    windyEmbedActive = true;
    setEnvironmentMapVisible(true);
    setEnvironmentStatus(
        "Interactive Windy.com forecast map",
        "Windy.com forecast/model"
    );
}


iconButtons.forEach(button => {
    button.addEventListener("click", () => {
        const panelId = button.dataset.panel;
        updateVisualizationPanel(panelId);
        const panel = document.getElementById(panelId);

        const isOpen = !panel.classList.contains("hidden");

        panels.forEach(item => {
            item.classList.add("hidden");
        });

        iconButtons.forEach(item => {
            item.classList.remove("active");
        });

        if (!isOpen) {
            panel.classList.remove("hidden");
            button.classList.add("active");

            if (panelId === "energyPanel") {
                clearEarlyWarningMapLayer();
                setEnvironmentMapVisible(false);
                setEnergy3DVisible(true);
            } else {
                clearEarlyWarningMapLayer();
                setEnvironmentMapVisible(false);
                setEnergy3DVisible(false);
            }

            document.querySelector(".map-area")?.classList.toggle(
                "logistics-active",
                panelId === "logisticsPanel"
            );

            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                }
            }, 200);
        } else {
            document.querySelector(".map-area")?.classList.remove("logistics-active");
        }
    });
});

closeButtons.forEach(button => {
    button.addEventListener("click", () => {
        panels.forEach(panel => {
            panel.classList.add("hidden");
        });

        iconButtons.forEach(item => {
            item.classList.remove("active");
        });

        document.querySelector(".map-area")?.classList.remove("logistics-active");

        setTimeout(() => {
            if (map) {
                map.invalidateSize();
            }
        }, 200);
    });
});

layerButtons.forEach(button => {
    button.addEventListener("click", () => {
        layerButtons.forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        const layer = button.dataset.layer;

        selectedLayerName.textContent =
            button.querySelector("strong").textContent;

        selectedLayerDescription.textContent =
            layerDescriptions[layer];

        applyMapLayer(layer);
    });
});

function applyMapLayer(layer) {
    if (layer === "snow") {
        layer = "snowfall";
    }

    selectedEnvironmentLayer = layer;

    if (windyInitialized) {
        setWindyLayer(layer);
    } else if (windyEmbedActive) {
        showLeafletEnvironmentFallback();
    }

}



function getInfrastructureSimulationImpact() {
    let renewableEnergy = 0;
    let solarCapacity = 0;
    let windCapacity = 0;
    let batteryCapacity = 0;
    let dieselCapacity = 0;
    let fuelStorage = 0;
    let waterCapacity = 0;

    if (typeof stationInfrastructure === "undefined") {
        return {
            renewableEnergy: 0,
            solarCapacity: 0,
            windCapacity: 0,
            batteryCapacity: 0,
            dieselCapacity: 0,
            fuelStorage: 0,
            waterCapacity: 0
        };
    }

    stationInfrastructure.forEach(item => {
        if (item.type === "solar" || item.type === "wind") {
            renewableEnergy += item.energy;
        }

        if (item.type === "solar") {
            solarCapacity += item.capacity;
        }

        if (item.type === "wind") {
            windCapacity += item.capacity;
        }

        if (item.type === "battery") {
            batteryCapacity += item.capacity;
        }

        if (item.type === "diesel") {
            dieselCapacity += item.capacity;
        }

        if (item.type === "fuel") {
            fuelStorage += item.capacity;
        }

        if (item.type === "water") {
            waterCapacity += item.capacity;
        }
    });

    return {
        renewableEnergy,
        solarCapacity,
        windCapacity,
        batteryCapacity,
        dieselCapacity,
        fuelStorage,
        waterCapacity
    };
}


initializeMap();
updateStationInformation();
openEnvironmentMap();

setInterval(loadWeather, 300000);

function getCurrentStationPosition() {
    const station = document.getElementById("station");

    if (station && station.value === "bharati") {
        return [-69.4069, 76.1956];
    }

    return [-70.7644, 11.7342];
}

/* =========================================================
   ENERGY MANAGEMENT MODEL

   The station power system is modelled from data the
   dashboard already uses: live weather and the power
   assets installed on the station.
========================================================= */

function getStationWeatherValues() {
        const readValue = (value, elementId) => {
        // Guard against null/undefined: Number(null) === 0 (which is finite!)
        // and Number(undefined) === NaN, so we must check explicitly.
        if (value !== null && value !== undefined) {
            const parsed = Number(value);

            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        const element = document.getElementById(elementId);
        const elementValue = Number(element?.textContent);

        return Number.isFinite(elementValue) ? elementValue : null;
    };

    return {
        temperature: readValue(latestWeather?.temperature, "liveTemperature"),
        wind: readValue(latestWeather?.wind_speed, "liveWind"),
        pressure: readValue(latestWeather?.pressure, "livePressure"),
        humidity: readValue(latestWeather?.humidity, "liveHumidity"),
        available: Boolean(latestWeather)
    };
}

function clampEnergyValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getInstalledEnergyCapacity() {
    const impact = getInfrastructureSimulationImpact();

    return {
        solar: stationEnergyBaseline.solar + impact.solarCapacity,
        wind: stationEnergyBaseline.wind + impact.windCapacity,
        diesel: stationEnergyBaseline.diesel + impact.dieselCapacity,
        battery: stationEnergyBaseline.battery + impact.batteryCapacity
    };
}

function getSolarIrradianceFactor(hour) {
    // Antarctic daylight is modelled with a shallow diurnal curve so the
    // array keeps a usable output floor through the polar summer.
    const daylight = Math.max(0, Math.sin((Math.PI * (hour - 4)) / 18));

    return clampEnergyValue(0.12 + daylight * 0.88, 0.12, 1);
}

function getSolarTemperatureFactor(temperature) {
    const safeTemperature = Number.isFinite(temperature) ? temperature : -18;

    return clampEnergyValue(1 - Math.max(0, -safeTemperature - 25) * 0.005, 0.6, 1);
}

function getWindCapacityFactor(windSpeed) {
    const speed = Number.isFinite(windSpeed) ? windSpeed : 8;

    if (speed < 3 || speed > 25) {
        return 0;
    }

    return clampEnergyValue((speed - 3) / 9, 0, 1);
}

function getStationLoadDemand(temperature) {
    const safeTemperature = Number.isFinite(temperature) ? temperature : -18;
    const heatingFactor = Math.max(0, (-safeTemperature - 12) / 30);

    return stationEnergyBaseline.load * (1 + heatingFactor * 0.35);
}
function getEnergySourceStatus(sourceId, source, weather) {
    if (sourceId === "solar") {
        return source.generationKw > 0.5 ? "GENERATING" : "IDLE";
    }

    if (sourceId === "wind") {
        const windSpeed = weather.wind;

        if (Number.isFinite(windSpeed) && windSpeed > 25) {
            return "SHUTDOWN";
        }

        if (!Number.isFinite(windSpeed) || windSpeed < 3) {
            return "IDLE";
        }

        return source.generationKw > 0.5 ? "GENERATING" : "IDLE";
    }

    if (sourceId === "diesel") {
        return source.generationKw > 0.5 ? "RUNNING" : "STANDBY";
    }

    if (source.batteryKw > 0.5) {
        return "CHARGING";
    }

    if (source.batteryKw < -0.5) {
        return "DISCHARGING";
    }

    return "HOLDING";
}

function getEnergySourceSeverity(sourceId, source, weather) {
    if (sourceId === "solar") {
        const output = source.capacity > 0 ? source.generationKw / source.capacity : 0;
        return output > 0.45 ? "good" : output > 0.18 ? "warning" : "critical";
    }

    if (sourceId === "wind") {
        const windSpeed = Number(weather.wind);

        if (Number.isFinite(windSpeed) && windSpeed > 25) {
            return "critical";
        }

        const output = source.capacity > 0 ? source.generationKw / source.capacity : 0;
        return output > 0.3 ? "good" : output > 0.1 ? "warning" : "critical";
    }

    if (sourceId === "diesel") {
        return source.generationKw > 0.5 ? "critical" : "neutral";
    }

    // Battery: green when charging/holding, orange when moderately
    // discharging, red when heavily discharging or critically low.
    const batteryKwh = source.capacity || 0;

    if (source.batteryKw < -(batteryKwh * 0.14)) {
        return "critical";
    }

    if (source.batteryKw < -0.5) {
        return "warning";
    }

    if ((source.storageLevel || 100) < 20) {
        return "critical";
    }

    return "good";
}

function computeEnergyState(weather, capacity, hour) {
    const solarKw =
        capacity.solar *
        getSolarIrradianceFactor(hour) *
        getSolarTemperatureFactor(weather.temperature);

    const windKw =
        capacity.wind * getWindCapacityFactor(weather.wind);

    const renewableKw = solarKw + windKw;
    const consumptionKw = getStationLoadDemand(weather.temperature);
    const renewableBalanceKw = renewableKw - consumptionKw;

    const coverage = consumptionKw > 0 ? renewableKw / consumptionKw : 1;
    const storageLevel = Math.round(
        clampEnergyValue(52 + (coverage - 0.8) * 45, 8, 97)
    );

    const chargeLimitKw = capacity.battery * 0.2;
    const dischargeLimitKw = Math.min(
        chargeLimitKw,
        capacity.battery * (storageLevel / 100)
    );

    let batteryKw = 0;
    let dieselKw = 0;

    if (renewableBalanceKw > 0.5) {
        batteryKw = Math.min(renewableBalanceKw, chargeLimitKw);
    } else if (renewableBalanceKw < -0.5) {
        const deficitKw = -renewableBalanceKw;

        // Battery absorbs short-term variation first, preserving diesel fuel.
        // The backup generator only covers sustained shortfall beyond what the
        // battery discharge limit can supply, at exactly the level required.
        const storageSupportKw = Math.min(deficitKw, dischargeLimitKw);
        const remainingDeficit = deficitKw - storageSupportKw;

        dieselKw =
            remainingDeficit > 0.5
                ? Math.min(capacity.diesel, remainingDeficit)
                : 0;

        batteryKw = -storageSupportKw;
    }

    const generationKw = renewableKw + dieselKw;
    const batterySupportKw = Math.max(0, -batteryKw);
    const supplyKw = generationKw + batterySupportKw;
    const shareOf = value => (supplyKw > 0 ? (value / supplyKw) * 100 : 0);

    const sourceValues = {
        solar: { generationKw: solarKw, share: shareOf(solarKw) },
        wind: { generationKw: windKw, share: shareOf(windKw) },
        diesel: { generationKw: dieselKw, share: shareOf(dieselKw) },
        battery: { generationKw: batterySupportKw, share: shareOf(batterySupportKw) }
    };

    const sources = Object.values(energySourceDefinitions).map(definition => {
        const values = sourceValues[definition.id];

        const source = {
            ...definition,
            capacity:
                definition.id === "battery"
                    ? capacity.battery
                    : capacity[definition.id],
            generationKw: values.generationKw,
            share: values.share,
            batteryKw
        };

        source.status = getEnergySourceStatus(definition.id, source, weather);
        source.severity = getEnergySourceSeverity(
            definition.id,
            { ...source, storageLevel },
            weather
        );

        return source;
    });

    const state =
        renewableBalanceKw > 3
            ? "SURPLUS"
            : renewableBalanceKw > -3
                ? "BALANCED"
                : "DEFICIT";

    const backupStatus =
        capacity.diesel <= 0
            ? "NOT INSTALLED"
            : dieselKw > 0.5
                ? `RUNNING · ${dieselKw.toFixed(1)} kW`
                : `STANDBY · ${Math.round(capacity.diesel)} kW available`;

    return {
        weather,
        capacity,
        solarKw,
        windKw,
        renewableKw,
        dieselKw,
        batteryKw,
        batterySupportKw,
        generationKw,
        consumptionKw,
        balanceKw: renewableBalanceKw,
        storageKwh: capacity.battery,
        storageLevel,
        renewableShare:
            generationKw > 0 ? (renewableKw / generationKw) * 100 : 0,
        efficiency: (() => {
            if (consumptionKw <= 0) {
                return 100;
            }

            const renewableRatio =
                generationKw > 0 ? (renewableKw / generationKw) * 100 : 0;
            const balanceScore =
                clampEnergyValue(
                    100 - (Math.abs(renewableBalanceKw) / consumptionKw) * 100,
                    0,
                    100
                );
            const dieselAvoidance =
                generationKw > 0
                    ? 100 - (dieselKw / generationKw) * 100
                    : 100;

            return Math.round(
                clampEnergyValue(
                    renewableRatio * 0.5 +
                        balanceScore * 0.3 +
                        dieselAvoidance * 0.2,
                    0,
                    100
                )
            );
        })(),
        state,
        backupStatus,
        sources,
        flowSummary: getEnergyFlowSummary(renewableKw, batteryKw, dieselKw)
    };
}

function getStationEnergyState() {
    const weather = getStationWeatherValues();
    const capacity = getInstalledEnergyCapacity();
    const now = new Date();
    const hour = now.getUTCHours() + now.getUTCMinutes() / 60;

    return computeEnergyState(weather, capacity, hour);
}

function getEnergyFlowSummary(renewableKw, batteryKw, dieselKw) {
    const storageText =
        batteryKw > 0.5
            ? `storage charging at ${batteryKw.toFixed(1)} kW`
            : batteryKw < -0.5
                ? `storage discharging at ${Math.abs(batteryKw).toFixed(1)} kW`
                : "storage holding level";

    const backupText =
        dieselKw > 0.5
            ? `backup generator supplying ${dieselKw.toFixed(1)} kW`
            : "backup generator on standby";

    return `${renewableKw.toFixed(1)} kW renewable generation · ${storageText} · ${backupText}.`;
}
function getEnergyForecastPoints(state, hours = 8) {
    const hourly = latestWeather?.hourly || {};
    const temperatures = Array.isArray(hourly.temperature) ? hourly.temperature : [];
    const winds = Array.isArray(hourly.wind_speed) ? hourly.wind_speed : [];
    const now = new Date();
    const points = [];

    for (let index = 0; index < hours; index++) {
        const pointTime = new Date(now.getTime() + index * 3600000);
        const hour = pointTime.getUTCHours();

        const forecastTemperature = Number(temperatures[index]);
        const forecastWind = Number(winds[index]);

        const temperature = Number.isFinite(forecastTemperature)
            ? forecastTemperature
            : state.weather.temperature;

        const windSpeed = Number.isFinite(forecastWind)
            ? forecastWind
            : state.weather.wind;

        const solarKw =
            state.capacity.solar *
            getSolarIrradianceFactor(hour) *
            getSolarTemperatureFactor(temperature);

        const windKw =
            state.capacity.wind * getWindCapacityFactor(windSpeed);

        const generationKw = solarKw + windKw;
        const consumptionKw = getStationLoadDemand(temperature);
        const balanceKw = generationKw - consumptionKw;

        points.push({
            label: `${String(hour).padStart(2, "0")}:00`,
            generationKw,
            consumptionKw,
            balanceKw,
            state:
                balanceKw > 3
                    ? "SURPLUS"
                    : balanceKw > -3
                        ? "BALANCED"
                        : "DEFICIT"
        });
    }

    return points;
}

function getStationEnergySnapshot() {
    const state = getStationEnergyState();

    state.forecast = getEnergyForecastPoints(state, 8);

    return state;
}

const station3DStructures = [
    {
        id: "habitat",
        name: "Main Habitat",
        type: "habitat",
        position: [-7, 0, 1],
        size: [7, 2.8, 5]
    },
    {
        id: "power",
        name: "Power House",
        type: "power",
        position: [3, 0, 1],
        size: [4.5, 2.6, 4]
    },
    {
        id: "fuel",
        name: "Fuel Depot",
        type: "fuel",
        position: [8, 0, -5],
        size: [3.5, 2.2, 3]
    },
    {
        id: "water",
        name: "Water Treatment",
        type: "water",
        position: [-1, 0, -6],
        size: [4, 2.3, 3.5]
    },
    {
        id: "communications",
        name: "Communications",
        type: "communications",
        position: [-9, 0, -6],
        size: [2.5, 2, 2.5]
    },
    {
        id: "warehouse",
        name: "Supply Warehouse",
        type: "warehouse",
        position: [9, 0, 4],
        size: [4.5, 2.4, 4]
    }
];

/* =========================================================
   ENERGY 3D MODEL

   The station modules stay in place while the power system is
   modelled around them: solar arrays, wind turbines, battery
   storage and the backup generator, with animated energy flow
   towards the station load.
========================================================= */

const energy3DLayout = {
    solar: [-12, 0, 7],
    wind: [-13, 0, -4],
    battery: [5, 0, 6],
    diesel: [7, 0, -10]
};

const energy3DAnchors = {
    solar: [-12, 2.2, 8.6],
    wind: [-13, 5.8, -4],
    battery: [5, 2, 6],
    diesel: [7, 2.2, -9],
    load: [3, 3.4, 1]
};

function energy3DPosition(position) {
    return new THREE.Vector3(position[0], position[1], position[2]);
}

function getEnergy3DSource(state, sourceId) {
    return state?.sources?.find(source => source.id === sourceId) || null;
}

function getEnergy3DOutputFactor(source) {
    if (!source || !source.capacity) {
        return 0;
    }

    return clampEnergyValue(source.generationKw / source.capacity, 0, 1);
}

const energy3DSeverityColors = {
    good: 0x22c55e,
    warning: 0xf59e0b,
    critical: 0xef4444,
    neutral: 0x64748b
};

function getEnergy3DSeverityColor(severity) {
    return energy3DSeverityColors[severity] || energy3DSeverityColors.neutral;
}

function makeEnergy3DStatusLabel(text, position, severity) {
    const canvas = document.createElement("canvas");

    canvas.width = 256;
    canvas.height = 64;

    const context = canvas.getContext("2d");

    context.fillStyle = "rgba(20, 32, 42, 0.82)";
    context.beginPath();
    context.roundRect(4, 8, 248, 48, 12);
    context.fill();

    context.strokeStyle = `#${new THREE.Color(getEnergy3DSeverityColor(severity)).getHexString()}`;
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = "#f1f6f9";
    context.font = "bold 24px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 33);

    const texture = new THREE.CanvasTexture(canvas);

    texture.anisotropy = 4;

    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false
        })
    );

    sprite.scale.set(3.4, 0.85, 1);
    sprite.position.set(position[0], position[1] + 1.15, position[2]);

    return sprite;
}

function getEnergy3DStatusLabel(state, sourceId) {
    const source = getEnergy3DSource(state, sourceId);

    if (!source) {
        return { text: "OFFLINE", severity: "neutral" };
    }

    if (sourceId === "battery") {
        const severity =
            state.batteryKw < -(state.capacity?.battery || 1) * 0.14
                ? "critical"
                : state.batteryKw < -0.5
                    ? "warning"
                    : "good";

        const action =
            state.batteryKw > 0.5 ? "CHARGING"
            : state.batteryKw < -0.5 ? "DISCHARGING"
            : "HOLDING";

        return {
            text: `${Math.round(state.storageLevel)}% | ${action}`,
            severity
        };
    }

    if (sourceId === "diesel") {
        const running = state.dieselKw > 0.5;

        return {
            text: running ? "ACTIVE" : "STANDBY",
            severity: running ? "critical" : "neutral"
        };
    }

    const severity =
        source.severity === "critical" ? "critical"
        : source.severity === "warning" ? "warning" : "good";

    return {
        text: `${Math.round(source.generationKw)} kW | ${
            severity === "good" ? "GOOD" : severity === "warning" ? "WARNING" : "CRITICAL"
        }`,
        severity
    };
}

function createEnergy3DStatusLabels(state) {
    energy3DStatusLabels.forEach(sprite => {
        energy3DGroup.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
    });

    energy3DStatusLabels = [];

    ["solar", "wind", "battery", "diesel"].forEach(sourceId => {
        const label = getEnergy3DStatusLabel(state, sourceId);
        const sprite = makeEnergy3DStatusLabel(
            label.text,
            energy3DAnchors[sourceId],
            label.severity
        );

        energy3DGroup.add(sprite);
        energy3DStatusLabels.push(sprite);
    });
}

function attachEnergy3DSelectionRing(group, color, radius) {
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + 0.35, 40),
        new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );

    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ring.visible = false;

    group.add(ring);
    group.userData.selectionRing = ring;

    return ring;
}

function makeEnergy3DBuilding(definition, state) {
    const group = new THREE.Group();

    const palettes = {
        SURPLUS: {
            body: 0x5d7f74,
            roof: 0x243a38,
            trim: 0x9ab8ae,
            window: 0x6ee7b7
        },
        BALANCED: {
            body: 0x607d8b,
            roof: 0x263746,
            trim: 0x8fa6b3,
            window: 0x38bdf8
        },
        DEFICIT: {
            body: 0x8a7650,
            roof: 0x4a4030,
            trim: 0xc7a75b,
            window: 0xfacc15
        }
    };

    const palette = palettes[state?.state] || palettes.BALANCED;

    const [width, height, depth] = definition.size;

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: palette.body,
        roughness: 0.72,
        metalness: 0.12
    });

    const roofMaterial = new THREE.MeshStandardMaterial({
        color: palette.roof,
        roughness: 0.65,
        metalness: 0.2
    });

    const trimMaterial = new THREE.MeshStandardMaterial({
        color: palette.trim,
        roughness: 0.55,
        metalness: 0.25
    });

    const windowMaterial = new THREE.MeshStandardMaterial({
        color: palette.window,
        emissive: palette.window,
        emissiveIntensity: 0.4,
        roughness: 0.25,
        metalness: 0.15
    });

    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.55,
        metalness: 0.2
    });

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        bodyMaterial
    );

    body.position.y = height / 2 + 0.8;
    body.castShadow = true;
    body.receiveShadow = true;

    group.add(body);

    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.45, 0.35, depth + 0.45),
        roofMaterial
    );

    roof.position.y = height + 1.05;
    roof.castShadow = true;

    group.add(roof);

    const roofCap = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.72, 0.18, depth * 0.72),
        trimMaterial
    );

    roofCap.position.y = height + 1.28;
    group.add(roofCap);

    const door = new THREE.Mesh(
        new THREE.BoxGeometry(
            Math.min(0.85, width * 0.18),
            Math.min(1.7, height * 0.62),
            0.12
        ),
        doorMaterial
    );

    door.position.set(0, 1.25, depth / 2 + 0.08);

    group.add(door);

    const windowCount = Math.max(2, Math.floor(width / 2));

    for (let index = 0; index < windowCount; index++) {
        const window = new THREE.Mesh(
            new THREE.BoxGeometry(0.75, 0.55, 0.08),
            windowMaterial
        );

        window.position.set(
            -width / 2 + ((index + 1) * width) / (windowCount + 1),
            height * 0.58,
            depth / 2 + 0.06
        );

        group.add(window);
    }

    if (definition.type === "fuel") {
        for (let index = 0; index < 3; index++) {
            const tank = new THREE.Mesh(
                new THREE.CylinderGeometry(0.7, 0.7, 1.6, 14),
                trimMaterial
            );

            tank.position.set(index * 1.2 - 1.2, 1.25, depth / 2 + 1);
            tank.castShadow = true;

            group.add(tank);
        }
    }

    if (definition.id === "power") {
        for (let index = -1; index <= 1; index++) {
            const pipe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, width * 0.7, 10),
                trimMaterial
            );

            pipe.rotation.z = Math.PI / 2;
            pipe.position.set(0, 1.15 + index * 0.28, -depth / 2 - 0.12);

            group.add(pipe);
        }
    }

    group.position.set(definition.position[0], 0, definition.position[2]);

    group.userData = {
        id: definition.id,
        name: definition.name,
        type: definition.type,
        stationModule: true
    };

    return group;
}
function makeEnergy3DSolarFarm(source) {
    const group = new THREE.Group();
    const output = getEnergy3DOutputFactor(source);
    const severityColor = getEnergy3DSeverityColor(source?.severity || "good");

    const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x2c4761,
        emissive: severityColor,
        emissiveIntensity: 0.12 + output * 0.6,
        roughness: 0.3,
        metalness: 0.45
    });

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x9aa9b2,
        roughness: 0.7,
        metalness: 0.2
    });

    for (let row = 0; row < 2; row++) {
        for (let column = 0; column < 3; column++) {
            const x = column * 3.6 - 3.6;
            const z = row * 2.6;

            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(3.2, 0.16, 1.7),
                panelMaterial
            );

            // Tilted towards the low Antarctic sun.
            panel.position.set(x, 1.15 + row * 1.4, z);
            panel.rotation.x = -0.42;
            panel.castShadow = true;

            group.add(panel);

            [-1.2, 1.2].forEach(offset => {
                const leg = new THREE.Mesh(
                    new THREE.BoxGeometry(0.16, 1.05, 0.16),
                    frameMaterial
                );

                leg.position.set(x + offset, 0.52, z);

                group.add(leg);
            });
        }
    }

    attachEnergy3DSelectionRing(group, 0xf0b64b, 6.4);

    group.userData = {
        id: "source-solar",
        name: source?.name || "Solar Power",
        energySourceId: "solar"
    };

    return group;
}

function makeEnergy3DWindFarm(source) {
    const group = new THREE.Group();
    const output = getEnergy3DOutputFactor(source);
    const spinning = source?.status !== "SHUTDOWN";

    const towerMaterial = new THREE.MeshStandardMaterial({
        color: 0xd7e0e5,
        roughness: 0.6,
        metalness: 0.25
    });

    const bladeMaterial = new THREE.MeshStandardMaterial({
        color: 0xdfe9ee,
        emissive: 0x63b8d8,
        emissiveIntensity: 0.1 + output * 0.35,
        roughness: 0.5
    });

    for (let index = 0; index < 3; index++) {
        const turbine = new THREE.Group();

        const tower = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.2, 5.4, 12),
            towerMaterial
        );

        tower.position.y = 2.7;
        tower.castShadow = true;

        turbine.add(tower);

        const nacelle = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.5, 0.95),
            towerMaterial
        );

        nacelle.position.y = 5.4;

        turbine.add(nacelle);

        const rotor = new THREE.Group();
        rotor.position.set(0, 5.4, 0.6);

        for (let blade = 0; blade < 3; blade++) {
            const holder = new THREE.Group();
            holder.rotation.z = ((Math.PI * 2) / 3) * blade;

            const bladeMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.16, 2.6, 0.08),
                bladeMaterial
            );

            bladeMesh.position.y = 1.3;

            holder.add(bladeMesh);
            rotor.add(holder);
        }

        turbine.add(rotor);

        turbine.position.set(
            index * 3.8 - 3.8,
            0,
            index % 2 === 0 ? 0 : 2.8
        );

        group.add(turbine);

        energy3DWindRotors.push({
            rotor,
            spinning,
            speed: spinning ? 0.45 + output * 2.1 : 0
        });
    }

    attachEnergy3DSelectionRing(group, 0x63b8d8, 6.6);

    group.userData = {
        id: "source-wind",
        name: source?.name || "Wind Power",
        energySourceId: "wind"
    };

    return group;
}
function makeEnergy3DBatteryBank(source) {
    const group = new THREE.Group();
    const charging = source?.status === "CHARGING";
    const active = charging || source?.status === "DISCHARGING";

    const cabinetMaterial = new THREE.MeshStandardMaterial({
        color: 0x4d5f6b,
        roughness: 0.6,
        metalness: 0.3
    });

    const ledColor = charging ? 0x22c55e : 0xf59e0b;

    const ledMaterial = new THREE.MeshStandardMaterial({
        color: ledColor,
        emissive: ledColor,
        emissiveIntensity: active ? 0.9 : 0.22,
        roughness: 0.3
    });

    for (let index = 0; index < 4; index++) {
        const x = index * 1.9 - 2.85;

        const cabinet = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 1.9, 1.3),
            cabinetMaterial
        );

        cabinet.position.set(x, 0.95, 0);
        cabinet.castShadow = true;

        group.add(cabinet);

        const led = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.12, 0.07),
            ledMaterial
        );

        led.position.set(x, 1.5, 0.68);

        group.add(led);
    }

    attachEnergy3DSelectionRing(group, 0x6fa87a, 4.6);

    group.userData = {
        id: "source-battery",
        name: source?.name || "Battery Storage",
        energySourceId: "battery"
    };

    return group;
}

function makeEnergy3DGenerator(source) {
    const group = new THREE.Group();
    const running = source?.status === "RUNNING";

    const containerMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a7c56,
        roughness: 0.72,
        metalness: 0.22
    });

    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a5f66,
        roughness: 0.6,
        metalness: 0.3
    });

    const indicatorMaterial = new THREE.MeshStandardMaterial({
        color: running ? 0xef4444 : 0x64748b,
        emissive: running ? 0xef4444 : 0x334155,
        emissiveIntensity: running ? 0.95 : 0.15,
        roughness: 0.35
    });

    const container = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 2.1, 2.4),
        containerMaterial
    );

    container.position.y = 1.05;
    container.castShadow = true;

    group.add(container);

    const housing = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.9, 1.8),
        housingMaterial
    );

    housing.position.y = 2.55;

    group.add(housing);

    const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 1.5, 12),
        housingMaterial
    );

    stack.position.set(1.2, 3.6, 0);

    group.add(stack);

    const indicator = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.16, 0.08),
        indicatorMaterial
    );

    indicator.position.set(0, 1.5, 1.24);

    group.add(indicator);

    // Fuel tank links the generator to the fuel depot behind the station.
    const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 1.7, 16),
        housingMaterial
    );

    tank.position.set(-3, 0.85, 0.4);
    tank.castShadow = true;

    group.add(tank);

    attachEnergy3DSelectionRing(group, 0xd98f4a, 5.2);

    group.userData = {
        id: "source-diesel",
        name: source?.name || "Diesel Generator",
        energySourceId: "diesel"
    };

    return group;
}
function createEnergy3DFlow(from, to, color, pulseCount, speed) {
    const start = energy3DPosition(from);
    const end = energy3DPosition(to);
    const mid = start.clone().lerp(end, 0.5);

    mid.y += Math.max(1.4, start.distanceTo(end) * 0.14);

    const curve = new THREE.CatmullRomCurve3([start, mid, end]);

    const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),
        new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.32
        })
    );

    const pulses = [];

    for (let index = 0; index < pulseCount; index++) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 10, 8),
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 1,
                roughness: 0.4
            })
        );

        pulses.push({
            mesh,
            progress: index / Math.max(1, pulseCount)
        });
    }

    return { line, curve, pulses, speed };
}

function createEnergy3DFlows(state) {
    energy3DFlows = [];

    const flowPlan = [
        {
            id: "solar",
            from: energy3DAnchors.solar,
            to: energy3DAnchors.battery,
            color: energySourceDefinitions.solar.color
        },
        {
            id: "wind",
            from: energy3DAnchors.wind,
            to: energy3DAnchors.battery,
            color: energySourceDefinitions.wind.color
        },
        {
            id: "diesel",
            from: energy3DAnchors.diesel,
            to: energy3DAnchors.battery,
            color: energySourceDefinitions.diesel.color
        },
        {
            id: "battery",
            from: energy3DAnchors.battery,
            to: energy3DAnchors.load,
            color: energySourceDefinitions.battery.color
        }
    ];

    flowPlan.forEach(plan => {
        const source = plan.id === "battery" ? null : getEnergy3DSource(state, plan.id);

        const outputKw =
            plan.id === "battery"
                ? Math.max(0, -(state?.batteryKw || 0))
                : source?.generationKw || 0;

        const referenceCapacity =
            plan.id === "battery"
                ? Math.max(1, (state?.capacity?.battery || 1) * 0.2)
                : Math.max(1, source?.capacity || 1);

        const intensity = clampEnergyValue(outputKw / referenceCapacity, 0, 1);
        const pulseCount = outputKw > 1 ? 3 : outputKw > 0.2 ? 1 : 0;

        if (!pulseCount) {
            return;
        }

        const flow = createEnergy3DFlow(
            plan.from,
            plan.to,
            plan.color,
            pulseCount,
            0.1 + intensity * 0.28
        );

        flow.sourceId = plan.id;

        energy3DFlows.push(flow);
    });
}

function createEnergy3DGround() {
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(42, 34),
        new THREE.MeshStandardMaterial({
            color: 0xc9d7dc,
            roughness: 0.95
        })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;

    energy3DScene.add(ground);

    const snow = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 28),
        new THREE.MeshStandardMaterial({
            color: 0xf3f7f8,
            roughness: 1
        })
    );

    snow.rotation.x = -Math.PI / 2;
    snow.position.y = 0.01;
    snow.receiveShadow = true;

    energy3DScene.add(snow);

    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.9
    });

    const road1 = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.08, 28),
        roadMaterial
    );

    road1.position.set(0, 0.08, 0);

    energy3DScene.add(road1);

    const road2 = new THREE.Mesh(
        new THREE.BoxGeometry(28, 0.08, 2.2),
        roadMaterial
    );

    road2.position.set(0, 0.09, 0);

    energy3DScene.add(road2);

    for (let index = 0; index < 18; index++) {
        const snowBank = new THREE.Mesh(
            new THREE.SphereGeometry(0.5 + Math.random() * 0.7, 12, 8),
            new THREE.MeshStandardMaterial({
                color: 0xe7eef1,
                roughness: 1
            })
        );

        snowBank.scale.y = 0.45;

        snowBank.position.set(
            -17 + Math.random() * 34,
            0.25,
            -13 + Math.random() * 26
        );

        energy3DScene.add(snowBank);
    }
}
function initializeEnergy3D() {
    if (energy3DInitialized) {
        updateEnergy3D();
        return;
    }

    const container = document.getElementById("energy3D");

    if (!container || typeof THREE === "undefined") {
        console.error("Three.js energy model could not initialize.");
        return;
    }

    energy3DScene = new THREE.Scene();
    energy3DScene.background = new THREE.Color(0xc4d4da);

    energy3DCamera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / Math.max(1, container.clientHeight),
        0.1,
        220
    );

    energy3DCamera.position.set(27, 21, 31);

    energy3DRenderer = new THREE.WebGLRenderer({
        antialias: true
    });

    energy3DRenderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.75)
    );

    energy3DRenderer.setSize(
        container.clientWidth,
        container.clientHeight
    );

    energy3DRenderer.shadowMap.enabled = true;

    container.appendChild(energy3DRenderer.domElement);

    energy3DControls = new THREE.OrbitControls(
        energy3DCamera,
        energy3DRenderer.domElement
    );

    energy3DControls.enableDamping = true;
    energy3DControls.dampingFactor = 0.06;
    energy3DControls.target.set(-1, 0.8, 0);
    energy3DControls.minDistance = 14;
    energy3DControls.maxDistance = 62;
    energy3DControls.maxPolarAngle = Math.PI / 2.05;

    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    energy3DScene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(15, 25, 12);
    keyLight.castShadow = true;
    energy3DScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeaf0, 0.7);
    fillLight.position.set(-20, 12, -10);
    energy3DScene.add(fillLight);

    createEnergy3DGround();

    energy3DRaycaster = new THREE.Raycaster();
    energy3DMouse = new THREE.Vector2();
    energy3DClock = new THREE.Clock();

    energy3DRenderer.domElement.addEventListener(
        "pointermove",
        handleEnergy3DPointerMove
    );

    energy3DRenderer.domElement.addEventListener(
        "click",
        handleEnergy3DClick
    );

    window.addEventListener(
        "resize",
        resizeEnergy3D
    );

    energy3DInitialized = true;

    updateEnergy3D();

    energy3DRenderLoop();
}

function updateEnergy3D() {
    if (!energy3DInitialized) {
        initializeEnergy3D();
        return;
    }

    if (!energy3DScene) {
        return;
    }

    energy3DState = getStationEnergySnapshot();

    rebuildEnergy3D();
}

function rebuildEnergy3D() {
    if (!energy3DScene) {
        return;
    }

    if (energy3DGroup) {
        energy3DScene.remove(energy3DGroup);
    }

    energy3DGroup = new THREE.Group();
    energy3DObjects = [];
    energy3DFlows = [];
    energy3DWindRotors = [];

    const state = energy3DState || getStationEnergySnapshot();

    station3DStructures.forEach(definition => {
        energy3DGroup.add(makeEnergy3DBuilding(definition, state));
    });

    const placements = [
        { sourceId: "solar", builder: makeEnergy3DSolarFarm },
        { sourceId: "wind", builder: makeEnergy3DWindFarm },
        { sourceId: "battery", builder: makeEnergy3DBatteryBank },
        { sourceId: "diesel", builder: makeEnergy3DGenerator }
    ];

    placements.forEach(placement => {
        const source = getEnergy3DSource(state, placement.sourceId);
        const group = placement.builder(source);

        group.position.set(
            energy3DLayout[placement.sourceId][0],
            0,
            energy3DLayout[placement.sourceId][2]
        );

        energy3DGroup.add(group);
        energy3DObjects.push(group);
    });

    createEnergy3DFlows(state);

    energy3DFlows.forEach(flow => {
        energy3DGroup.add(flow.line);

        flow.pulses.forEach(pulse => energy3DGroup.add(pulse.mesh));
    });

    energy3DScene.add(energy3DGroup);

    updateEnergy3DOverlay();
    updateEnergy3DSelection();
}
function updateEnergy3DOverlay() {
    const title = document.querySelector(".energy3d-title strong");
    const summary = document.getElementById("energy3dFlowSummary");

    if (title) {
        title.textContent =
            `${stations[currentStation]?.name || "Station"} Energy Model`;
    }

    if (summary && energy3DState) {
        summary.textContent = energy3DState.flowSummary;
    }
}

function applyEnergySimulationTo3D(result) {
    if (!result) {
        return;
    }

    energy3DState = result;

    if (energy3DInitialized) {
        rebuildEnergy3D();
    }

    updateEnergy3DOverlay();
}

function getEnergy3DNode(object) {
    let node = object;

    while (node) {
        if (node.userData?.energySourceId) {
            return node;
        }

        node = node.parent;
    }

    return null;
}

function selectEnergy3DSource(sourceId) {
    energy3DSelectedSource = sourceId;

    updateEnergy3DSelection();
}

function updateEnergy3DSelection() {
    const source =
        energy3DSelectedSource && energy3DState
            ? getEnergy3DSource(energy3DState, energy3DSelectedSource)
            : null;

    const name = document.getElementById("energy3dSourceName");
    const generation = document.getElementById("energy3dSourceGeneration");
    const share = document.getElementById("energy3dSourceShare");
    const status = document.getElementById("energy3dSourceStatus");

    if (name) {
        name.textContent = source ? source.name : "No source selected";
    }

    if (generation) {
        generation.textContent = source
            ? `${source.generationKw.toFixed(1)} kW output`
            : "-- kW";
    }

    if (share) {
        share.textContent = source
            ? `${Math.round(source.share)}% of current supply · ${
                source.id === "battery"
                    ? `${Math.round(source.capacity).toLocaleString("en-IN")} kWh storage`
                    : `${Math.round(source.capacity).toLocaleString("en-IN")} kW installed`
            }`
            : "Contribution -- %";
    }

    if (status) {
        status.textContent = source ? source.status : "--";
        status.className = source
            ? `energy3d-source-status ${source.status.toLowerCase()}`
            : "energy3d-source-status";
    }

    energy3DObjects.forEach(group => {
        if (group.userData.selectionRing) {
            group.userData.selectionRing.visible =
                group.userData.energySourceId === energy3DSelectedSource;
        }
    });
}
function handleEnergy3DPointerMove(event) {
    if (!energy3DRenderer || !energy3DRaycaster) {
        return;
    }

    const rect =
        energy3DRenderer.domElement.getBoundingClientRect();

    energy3DMouse.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

    energy3DMouse.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

    energy3DRaycaster.setFromCamera(
        energy3DMouse,
        energy3DCamera
    );

    const intersections =
        energy3DRaycaster.intersectObjects(energy3DObjects, true);

    const tooltip = document.getElementById("energy3d-tooltip");

    const node = intersections.length
        ? getEnergy3DNode(intersections[0].object)
        : null;

    if (!node) {
        energy3DHovered = null;

        if (tooltip) {
            tooltip.style.display = "none";
        }

        energy3DRenderer.domElement.style.cursor = "default";
        return;
    }

    const source = getEnergy3DSource(
        energy3DState,
        node.userData.energySourceId
    );

    if (!source) {
        return;
    }

    energy3DHovered = node;

    energy3DRenderer.domElement.style.cursor = "pointer";

    if (tooltip) {
        const capacityText =
            source.id === "battery"
                ? `${Math.round(source.capacity).toLocaleString("en-IN")} kWh storage`
                : `${Math.round(source.capacity).toLocaleString("en-IN")} kW installed`;

        tooltip.innerHTML =
            `<strong>${source.name}</strong>` +
            `<span>${source.generationKw.toFixed(1)} ${source.unit} · ${source.status}</span>` +
            `<span>${Math.round(source.share)}% of current supply · ${capacityText}</span>`;

        tooltip.style.display = "block";
        tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        tooltip.style.top = `${event.clientY - rect.top + 12}px`;
    }
}

function handleEnergy3DClick(event) {
    if (!energy3DRenderer || !energy3DRaycaster) {
        return;
    }

    const rect =
        energy3DRenderer.domElement.getBoundingClientRect();

    energy3DMouse.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

    energy3DMouse.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

    energy3DRaycaster.setFromCamera(
        energy3DMouse,
        energy3DCamera
    );

    const intersections =
        energy3DRaycaster.intersectObjects(energy3DObjects, true);

    if (!intersections.length) {
        return;
    }

    const node = getEnergy3DNode(intersections[0].object);

    if (!node) {
        return;
    }

    energy3DHovered = node;

    selectEnergy3DSource(node.userData.energySourceId);
}

function resizeEnergy3D() {
    const container = document.getElementById("energy3D");

    if (
        !container ||
        !energy3DRenderer ||
        !energy3DCamera
    ) {
        return;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    energy3DCamera.aspect = width / height;

    energy3DCamera.updateProjectionMatrix();

    energy3DRenderer.setSize(width, height);
}

function animateEnergy3D(delta) {
    energy3DWindRotors.forEach(entry => {
        entry.rotor.rotation.z += entry.speed * delta;
    });

    energy3DFlows.forEach(flow => {
        flow.pulses.forEach(pulse => {
            pulse.progress = (pulse.progress + flow.speed * delta) % 1;

            flow.curve.getPointAt(pulse.progress, pulse.mesh.position);
        });
    });
}

function energy3DRenderLoop() {
    if (!energy3DRenderer) return;

    requestAnimationFrame(
        energy3DRenderLoop
    );

    const delta = Math.min(0.05, energy3DClock?.getDelta() || 0);

    animateEnergy3D(delta);

    energy3DControls?.update();

    energy3DRenderer.render(
        energy3DScene,
        energy3DCamera
    );
}

function setEnergy3DVisible(visible) {
    const mapArea = document.querySelector(".map-area");

    if (!mapArea) return;

    mapArea.classList.toggle(
        "energy-3d-active",
        visible
    );

    if (visible) {
        initializeEnergy3D();

        setTimeout(() => {
            resizeEnergy3D();
            updateEnergy3D();
        }, 100);
    }
}


/* =========================================================
   ENERGY DASHBOARD
========================================================= */

function setEnergyText(id, value) {
    const element = document.getElementById(id);

    if (element) element.textContent = value;
}

function getEnergyStateLabel(state) {
    if (state === "SURPLUS") return "SURPLUS POWER";
    if (state === "DEFICIT") return "POWER DEFICIT";
    return "BALANCED";
}

function getEnergyStateShortLabel(state) {
    if (state === "SURPLUS") return "Surplus";
    if (state === "DEFICIT") return "Deficit";
    return "Balanced";
}

function getEnergyStateDetail(state, balanceKw, batteryKw) {
    if (state === "SURPLUS") {
        return batteryKw > 0.5
            ? `Renewable generation covers the load with ${balanceKw.toFixed(1)} kW spare, charging storage.`
            : `Renewable generation covers the station load with ${balanceKw.toFixed(1)} kW spare capacity.`;
    }

    if (state === "DEFICIT") {
        return `Renewables are ${Math.abs(balanceKw).toFixed(1)} kW short. Storage and the backup generator cover the shortfall.`;
    }

    return "Renewable generation is matched to the station load within operating tolerance.";
}

function renderEnergyStatus(state) {
    const balanceSign = state.balanceKw >= 0 ? "+" : "-";

    setEnergyText("energyGenerationNow", `${state.generationKw.toFixed(1)} kW`);

    setEnergyText(
        "energyGenerationDetail",
        `${state.renewableKw.toFixed(1)} kW renewable · ${state.dieselKw.toFixed(1)} kW backup`
    );

    setEnergyText("energyConsumptionNow", `${state.consumptionKw.toFixed(1)} kW`);

    setEnergyText(
        "energyConsumptionDetail",
        Number.isFinite(state.weather.temperature)
            ? `Heating-adjusted for ${state.weather.temperature.toFixed(1)} °C`
            : "Modeled station load"
    );

    setEnergyText("energyStorageNow", `${state.storageLevel} %`);

    setEnergyText(
        "energyStorageDetail",
        `${Math.round(state.storageKwh).toLocaleString("en-IN")} kWh of storage capacity`
    );

    setEnergyText(
        "energyBalanceNow",
        `${balanceSign}${Math.abs(state.balanceKw).toFixed(1)} kW ${
            state.balanceKw > 0
                ? "surplus"
                : state.balanceKw < 0
                    ? "deficit"
                    : "balanced"
        }`
    );

    const balanceState = document.getElementById("energyBalanceState");

    if (balanceState) {
        balanceState.textContent = getEnergyStateLabel(state.state);
        balanceState.className =
            `energy-state-pill ${state.state.toLowerCase()}`;
    }

    const storageBar = document.getElementById("energyStorageBar");

    if (storageBar) {
        storageBar.style.width = `${state.storageLevel}%`;
        storageBar.className =
            state.storageLevel < 25
                ? "low"
                : state.storageLevel < 50
                    ? "medium"
                    : "";
    }
}

function renderEnergySourceCards(state) {
    const container = document.getElementById("energySourceCards");

    if (!container) return;

    container.innerHTML = state.sources.map(source => `
        <article
            class="energy-source-card ${source.id}"
            data-energy-source="${source.id}"
            tabindex="0"
            role="button"
            aria-label="Inspect ${source.name}"
        >
            <div class="energy-source-heading">
                <strong>${source.name}</strong>
                <span class="energy-source-icon">${source.icon}</span>
            </div>

            <div class="energy-source-value">
                <b>${source.generationKw.toFixed(1)}</b>
                <span>${source.unit}</span>
            </div>

            <div class="energy-source-share">
                <div class="energy-meter">
                    <i style="width:${Math.round(source.share)}%"></i>
                </div>

                <small>${Math.round(source.share)}% of supply · ${source.status}</small>
            </div>
        </article>
    `).join("");

    container.querySelectorAll(".energy-source-card").forEach(card => {
        const selectSource = () => selectEnergy3DSource(card.dataset.energySource);

        card.addEventListener("click", selectSource);

        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectSource();
            }
        });
    });
}

function renderEnergyFlow(state) {
    const sourceOutputKw = state.solarKw + state.windKw + state.dieselKw;

    setEnergyText("energyFlowSources", `${sourceOutputKw.toFixed(1)} kW`);

    setEnergyText("energyFlowStorage", `${state.storageLevel} %`);

    setEnergyText(
        "energyFlowStorageNote",
        state.batteryKw > 0.5
            ? `Charging ${state.batteryKw.toFixed(1)} kW`
            : state.batteryKw < -0.5
                ? `Discharging ${Math.abs(state.batteryKw).toFixed(1)} kW`
                : "Storage holding"
    );

    setEnergyText("energyFlowLoad", `${state.consumptionKw.toFixed(1)} kW`);
}
/* =========================================================
   ENERGY CONDITION SIMULATION (right panel)

   energyScenarioDefinitions, hasRunEnergySimulation and
   lastEnergySimulation are declared with the top-level state near the top of
   this file so the synchronous startup path can read them safely.
========================================================= */

function getEnergyScenarioConditions(scenarioKey) {
    const definition = energyScenarioDefinitions[scenarioKey] || energyScenarioDefinitions.normal;
    const live = getStationWeatherValues();
    const baseTemperature = Number.isFinite(live.temperature) ? live.temperature : -18;
    const baseWind = Number.isFinite(live.wind) ? live.wind : 8;
    return {
        definition,
        temperature: definition.temperature !== null ? definition.temperature : baseTemperature,
        wind: definition.wind !== null ? definition.wind : baseWind
    };
}

function describeSolarAvailability(factor) {
    if (factor >= 0.9) return "High";
    if (factor >= 0.6) return "Moderate";
    if (factor >= 0.3) return "Low";
    return "Very low";
}

function updateEnergyScenarioConditions() {
    const scenarioKey = document.getElementById("energyScenario")?.value || "normal";
    const resolved = getEnergyScenarioConditions(scenarioKey);
    setEnergyText("energySimStation", `${stations[currentStation]?.name || "Station"} · ${resolved.definition.label}`);
    setEnergyText("energySimTemp", `${resolved.temperature.toFixed(1)} °C`);
    setEnergyText("energySimWind", `${resolved.wind.toFixed(1)} m/s`);
    setEnergyText("energySimSolar", describeSolarAvailability(resolved.definition.solarFactor));
    setEnergyText("energySimSnow", resolved.definition.snowfall);
    setEnergyText("energySimStorm", resolved.definition.storm);
}

function computeEnergyScenarioResult(scenarioKey) {
    const resolved = getEnergyScenarioConditions(scenarioKey);
    const definition = resolved.definition;
    const capacity = getInstalledEnergyCapacity();
    const now = new Date();
    const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
    const stormFactor = definition.storm === "Extreme" ? 0.7 : definition.storm === "Severe" ? 0.8 : definition.storm === "Moderate" ? 0.92 : 1;
    const solarKw = capacity.solar * getSolarIrradianceFactor(hour) * getSolarTemperatureFactor(resolved.temperature) * definition.solarFactor * stormFactor;
    const windKw = capacity.wind * getWindCapacityFactor(resolved.wind) * definition.windFactor * stormFactor;
    const renewableKw = solarKw + windKw;
    const consumptionKw = getStationLoadDemand(resolved.temperature) + definition.loadExtraKw;
    const renewableBalanceKw = renewableKw - consumptionKw;
    const coverage = consumptionKw > 0 ? renewableKw / consumptionKw : 1;
    const storageLevel = Math.round(clampEnergyValue(52 + (coverage - 0.8) * 45, 8, 97));
    const chargeLimitKw = capacity.battery * 0.2;
    const dischargeLimitKw = Math.min(chargeLimitKw, capacity.battery * (storageLevel / 100));
    let batteryKw = 0;
    let dieselKw = 0;
    if (renewableBalanceKw > 0.5) {
        batteryKw = Math.min(renewableBalanceKw, chargeLimitKw);
    } else if (renewableBalanceKw < -0.5) {
        const deficitKw = -renewableBalanceKw;
        const storageSupportKw = Math.min(deficitKw, dischargeLimitKw);
        const remainingDeficit = deficitKw - storageSupportKw;
        batteryKw = -storageSupportKw;
    }
    const generationKw = renewableKw + dieselKw;
    const simState = renewableBalanceKw > 3 ? "SURPLUS" : renewableBalanceKw > -3 ? "BALANCED" : "DEFICIT";

    const batterySupportKw = Math.max(0, -batteryKw);
    const supplyKw = generationKw + batterySupportKw;
    const shareOf = value => (supplyKw > 0 ? (value / supplyKw) * 100 : 0);

    const sourceValues = {
        solar: { generationKw: solarKw, share: shareOf(solarKw) },
        wind: { generationKw: windKw, share: shareOf(windKw) },
        diesel: { generationKw: dieselKw, share: shareOf(dieselKw) },
        battery: { generationKw: batterySupportKw, share: shareOf(batterySupportKw) }
    };

    const sources = Object.values(energySourceDefinitions).map(definition => {
        // Use the outer-scope computed values (solarKw, windKw, dieselKw,
        // batteryKw) rather than re-deriving per-source.  The scenario-level
        // solarFactor / windFactor / loadExtraKw belong to the scenario
        // definition (resolved.definition), NOT the source definition, so
        // accessing them here would yield undefined and propagate NaN
        // into the 3D hover / card rendering.
        const values = sourceValues[definition.id];

        const source = {
            ...definition,
            capacity: definition.id === "battery"
                ? capacity.battery
                : capacity[definition.id],
            generationKw: values.generationKw,
            share: values.share,
            batteryKw
        };

        const weather = {
            temperature: resolved.temperature,
            wind: resolved.wind
        };

        source.status = getEnergySourceStatus(definition.id, source, weather);
        source.severity = getEnergySourceSeverity(
            definition.id,
            { ...source, storageLevel },
            weather
        );

        return source;
    });

    return {
        scenarioKey, definition, temperature: resolved.temperature, wind: resolved.wind,
        capacity, solarKw, windKw, renewableKw, dieselKw, batteryKw,
        batterySupportKw: Math.max(0, -batteryKw),
        generationKw, consumptionKw, balanceKw: renewableBalanceKw, storageLevel,
        renewableShare: generationKw > 0 ? (renewableKw / generationKw) * 100 : 0,
        state: simState,
        backupStatus: capacity.diesel <= 0 ? "NOT INSTALLED" : dieselKw > 0.5 ? `RUNNING · ${dieselKw.toFixed(1)} kW` : `STANDBY · ${Math.round(capacity.diesel)} kW available`,
        sources
    };
}

function getEnergySimulationWarnings(result) {
    const warnings = [];
    if (result.state === "DEFICIT") warnings.push("POWER DEFICIT");
    if (result.batteryKw < -0.5) warnings.push("BATTERY DISCHARGING");
    if (result.batteryKw > 0.5) warnings.push("BATTERY CHARGING");
    if (result.dieselKw > 0.5) warnings.push("BACKUP GENERATOR REQUIRED");
    if (result.state === "SURPLUS") warnings.push("SURPLUS POWER");
    return warnings;
}

function renderEnergySimulationResult(result) {
    if (!result) return;
    setEnergyText("energySimGeneration", `${result.generationKw.toFixed(1)} kW`);
    setEnergyText("energySimGenerationNote", `Solar ${result.solarKw.toFixed(1)} · Wind ${result.windKw.toFixed(1)} · Backup ${result.dieselKw.toFixed(1)} kW`);
    setEnergyText("energySimConsumption", `${result.consumptionKw.toFixed(1)} kW`);
    setEnergyText("energySimStorage", `${result.storageLevel} %`);
    setEnergyText("energySimBatteryNote", result.batteryKw > 0.5 ? `Charging ${result.batteryKw.toFixed(1)} kW` : result.batteryKw < -0.5 ? `Discharging ${Math.abs(result.batteryKw).toFixed(1)} kW` : "Storage holding");
    const balanceSign = result.balanceKw >= 0 ? "+" : "-";
    const balanceWord = result.balanceKw > 0 ? "surplus" : result.balanceKw < 0 ? "deficit" : "balanced";
    setEnergyText("energySimBalance", `${balanceSign}${Math.abs(result.balanceKw).toFixed(1)} kW ${balanceWord}`);
    setEnergyText("energySimRenewable", `${Math.round(result.renewableShare)} %`);
    setEnergyText("energySimBackup", result.backupStatus);
    const storageBar = document.getElementById("energySimStorageBar");
    if (storageBar) {
        storageBar.style.width = `${result.storageLevel}%`;
        storageBar.className = result.storageLevel < 25 ? "low" : result.storageLevel < 50 ? "medium" : "";
    }
    const stateCard = document.getElementById("energySimStateCard");
    if (stateCard) stateCard.className = `visualization-card energy-state-card ${result.state.toLowerCase()}`;
    setEnergyText("energySimStateLabel", getEnergyStateLabel(result.state));
    setEnergyText("energySimStateDetail", getEnergyStateDetail(result.state, result.balanceKw, result.batteryKw));
    const warningsBox = document.getElementById("energySimWarnings");
    if (warningsBox) {
        warningsBox.innerHTML = getEnergySimulationWarnings(result).map(warning => {
            const level = (warning === "POWER DEFICIT" || warning === "BACKUP GENERATOR REQUIRED") ? "critical" : warning === "BATTERY DISCHARGING" ? "warn" : "ok";
            return `<span class="energy-sim-warning ${level}">${warning}</span>`;
        }).join("");
    }
}

function updateEnergyScenarioChart() {
    const canvas = document.getElementById("energySimChart");
    if (!canvas || typeof Chart === "undefined") return;
    if (energyBalanceChart) { energyBalanceChart.destroy(); energyBalanceChart = null; }
    const scenarioKey = document.getElementById("energyScenario")?.value || "normal";
    const result = hasRunEnergySimulation && lastEnergySimulation ? lastEnergySimulation : computeEnergyScenarioResult(scenarioKey);
    const now = new Date();
    const labels = [];
    const generation = [];
    const consumption = [];
    for (let index = 0; index < 6; index++) {
        const pointTime = new Date(now.getTime() + index * 3600000);
        const hour = pointTime.getUTCHours();
        const rel = 0.75 + getSolarIrradianceFactor(hour) * 0.45 - index * 0.02;
        labels.push(index === 0 ? "Now" : `${String(hour).padStart(2, "0")}:00`);
        generation.push(Math.round(result.generationKw * rel * 10) / 10);
        consumption.push(Math.round(result.consumptionKw * (1 + index * 0.008) * 10) / 10);
    }
    energyBalanceChart = new Chart(canvas, {
        type: "line",
        data: { labels, datasets: [
            { label: "Generation kW", data: generation, borderColor: "#3b8a68", backgroundColor: "rgba(59, 138, 104, 0.12)", borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
            { label: "Consumption kW", data: consumption, borderColor: "#39779b", backgroundColor: "rgba(57, 119, 155, 0.10)", borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true }
        ] },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { display: true, labels: { boxWidth: 9, font: { size: 9 } } } },
            scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 8 } }, grid: { display: false } }, y: { ticks: { font: { size: 8 } } } }
        }
    });
}

function runEnergyConditionSimulation() {
    const scenarioKey = document.getElementById("energyScenario")?.value || "normal";
    updateEnergyScenarioConditions();
    lastEnergySimulation = computeEnergyScenarioResult(scenarioKey);
    hasRunEnergySimulation = true;
    renderEnergySimulationResult(lastEnergySimulation);
    updateEnergyScenarioChart();
    applyEnergySimulationTo3D(lastEnergySimulation);
}

function resetEnergyConditionSimulation() {
    hasRunEnergySimulation = false;
    lastEnergySimulation = null;

    const state = getStationEnergySnapshot();
    energy3DState = state;

    if (energy3DInitialized) {
        rebuildEnergy3D();
    }

    renderEnergyStatus(state);
    renderEnergySourceCards(state);
    renderEnergyFlow(state);
    renderEnergyAnalysis(state);
    renderEnergyForecast(state);
    updateEnergyChart(state);
    updateEnergyDashboard();
}

function renderEnergyAnalysis(state) {
    if (!document.getElementById("energySimGeneration")) return;
    const scenarioKey = document.getElementById("energyScenario")?.value || "normal";
    if (!hasRunEnergySimulation && scenarioKey === "normal") updateEnergyScenarioConditions();
    if (!hasRunEnergySimulation) return;
    renderEnergySimulationResult(lastEnergySimulation);
}

function renderEnergyForecast(state) {
    return;
}

function updateEnergyChart(state) {
    updateEnergyScenarioChart();
}

function updateEnergyDashboard() {
    const state = getStationEnergySnapshot();

    renderEnergyStatus(state);
    renderEnergySourceCards(state);
    renderEnergyFlow(state);
    renderEnergyAnalysis(state);
    renderEnergyForecast(state);
    updateEnergyChart(state);

    if (energy3DInitialized) {
        energy3DState = state;

        rebuildEnergy3D();
    }
}

const infrastructureData = {

    solar: {
        name: "Solar Power System",
        unit: "kW",
        costPerUnit: 95000,
        energyPerUnit: 3.8,
        fuelPerUnit: 0.8,
        co2PerUnit: 2.1
    },

    wind: {
        name: "Wind Turbine",
        unit: "kW",
        costPerUnit: 120000,
        energyPerUnit: 5.2,
        fuelPerUnit: 1.1,
        co2PerUnit: 2.8
    },

    battery: {
        name: "Battery Storage",
        unit: "kWh",
        costPerUnit: 28000,
        energyPerUnit: 0,
        fuelPerUnit: 0,
        co2PerUnit: 0
    },

    diesel: {
        name: "Diesel Generator",
        unit: "kW",
        costPerUnit: 70000,
        energyPerUnit: 0,
        fuelPerUnit: -0.4,
        co2PerUnit: -1.1
    },

    fuel: {
        name: "Fuel Storage",
        unit: "L",
        costPerUnit: 85,
        energyPerUnit: 0,
        fuelPerUnit: 0,
        co2PerUnit: 0
    },

    water: {
        name: "Water Treatment System",
        unit: "L/day",
        costPerUnit: 180,
        energyPerUnit: -0.15,
        fuelPerUnit: -0.05,
        co2PerUnit: -0.08
    }
};

function updateInfrastructureControls() {

    const type = infrastructureType.value;
    const data = infrastructureData[type];

    infrastructureUnit.textContent = data.unit;

    if (type === "fuel") {
        infrastructureCapacity.min = 500;
        infrastructureCapacity.max = 20000;
        infrastructureCapacity.value = 5000;
    }
    else if (type === "water") {
        infrastructureCapacity.min = 100;
        infrastructureCapacity.max = 5000;
        infrastructureCapacity.value = 1000;
    }
    else if (type === "battery") {
        infrastructureCapacity.min = 50;
        infrastructureCapacity.max = 1000;
        infrastructureCapacity.value = 200;
    }
    else {
        infrastructureCapacity.min = 10;
        infrastructureCapacity.max = 500;
        infrastructureCapacity.value = 100;
    }

    infrastructureCapacityValue.textContent =
        infrastructureCapacity.value;
}

function calculateInfrastructureImpact() {
    // Installed power assets are part of the energy model, so the status
    // cards, the energy analysis panel and the 3D scene refresh together.
    updateEnergyDashboard();
}

function getEnergyAssetDetail(item) {
    if (item.type === "battery") {
        return `${item.capacity.toLocaleString("en-IN")} kWh usable storage`;
    }

    if (item.type === "fuel") {
        return `${item.capacity.toLocaleString("en-IN")} L fuel reserve`;
    }

    if (item.type === "water") {
        return `${item.capacity.toLocaleString("en-IN")} L/day treatment capacity`;
    }

    if (item.energy > 0) {
        return `${item.energy.toFixed(1)} kWh/day generation`;
    }

    return `${item.capacity.toLocaleString("en-IN")} ${item.unit} backup capacity`;
}

function renderInfrastructure() {

    const list = document.getElementById("infrastructureList");

    if (!list) {
        return;
    }

    if (stationInfrastructure.length === 0) {

        list.innerHTML =
            `<div class="empty-infrastructure">
                No additional power sources added.
            </div>`;

        calculateInfrastructureImpact();

        return;
    }

    list.innerHTML =
        stationInfrastructure.map(function (item, index) {

            return `
                <div class="infrastructure-item">

                    <div class="energy-asset-heading">

                        <strong>
                            ${item.name}
                        </strong>

                        <span>
                            ${item.capacity.toLocaleString("en-IN")}
                            ${item.unit}
                        </span>

                    </div>

                    <span>
                        ${getEnergyAssetDetail(item)}
                    </span>

                    <button
                        class="remove-infrastructure"
                        data-index="${index}"
                    >
                        Remove
                    </button>

                </div>
            `;

        }).join("");

    document
        .querySelectorAll(".remove-infrastructure")
        .forEach(function (button) {

            button.addEventListener(
                "click",
                function () {

                    const index =
                        Number(this.dataset.index);

                    stationInfrastructure.splice(
                        index,
                        1
                    );

                    saveStationInfrastructure();
                    renderInfrastructure();
                    updateEnergyDashboard();
                    updateLogistics();
                }
            );

        });

    calculateInfrastructureImpact();
}

infrastructureType?.addEventListener(
    "change",
    updateInfrastructureControls
);

infrastructureCapacity?.addEventListener(
    "input",
    function () {

        infrastructureCapacityValue.textContent =
            Number(this.value)
                .toLocaleString("en-IN");

    }
);

addInfrastructure?.addEventListener(
    "click",
    function () {

        const type =
            infrastructureType.value;

        const capacity =
            Number(infrastructureCapacity.value);

        const data =
            infrastructureData[type];

        const item = {

            type: type,

            name: data.name,

            capacity: capacity,

            unit: data.unit,

            cost:
                capacity *
                data.costPerUnit,

            energy:
                capacity *
                data.energyPerUnit,

            fuel:
                capacity *
                data.fuelPerUnit,

            co2:
                capacity *
                data.co2PerUnit

        };

        stationInfrastructure.push(item);

        saveStationInfrastructure();
        renderInfrastructure();
        updateEnergyDashboard();
        updateLogistics();

    }
);

updateInfrastructureControls();
loadStationInfrastructure();
renderInfrastructure();
document.getElementById("refreshEnergyStatus")?.addEventListener("click", updateEnergyDashboard);
document.getElementById("energyScenario")?.addEventListener("change", updateEnergyScenarioConditions);
document.getElementById("runEnergySimulation")?.addEventListener("click", runEnergyConditionSimulation);
document.getElementById("energySimReset")?.addEventListener("click", resetEnergyConditionSimulation);

function updateLogistics() {
    const temperature =
        parseFloat(document.getElementById("liveTemperature")?.textContent);

    const wind =
        parseFloat(document.getElementById("liveWind")?.textContent);

    const resourceType =
        document.getElementById("resourceType")?.value || "fuel";

    const resources = {
        fuel: {
            stock: stationLogisticsBaseline.fuelStock,
            unit: "L",
            daily: stationLogisticsBaseline.dailyFuelUse
        },

        food: {
            stock: stationLogisticsBaseline.foodStock,
            unit: "kg",
            daily: stationLogisticsBaseline.personnel * 2.2
        },

        water: {
            stock: stationLogisticsBaseline.waterStock,
            unit: "L",
            daily: 150
        },

        medical: {
            stock: stationLogisticsBaseline.medicalStock,
            unit: "units",
            daily: stationLogisticsBaseline.personnel * 0.02
        }
    };

    const resource = resources[resourceType];

    const infrastructure = getInfrastructureSimulationImpact();
    if (resourceType === "water") {
        resource.stock += infrastructure.waterCapacity;
        resource.daily = Math.max(1, resource.daily - infrastructure.waterCapacity * 0.01);
    }

    const currentWind =
        Number.isFinite(wind) ? wind : 8;

    const currentTemperature =
        Number.isFinite(temperature) ? temperature : -18;

    let transport = 100;

    if (currentWind >= 25) {
        transport -= 25;
    } else if (currentWind >= 18) {
        transport -= 15;
    }

    if (currentTemperature <= -35) {
        transport -= 25;
    } else if (currentTemperature <= -25) {
        transport -= 15;
    }

    const derivedSnowfall = Math.max(0, Math.min(100, 25 + Math.max(0, (-currentTemperature - 10) * 1.8)));
    const derivedVisibility = Math.max(15, 100 - derivedSnowfall * 0.55);
    const derivedStorm = Math.max(0, Math.min(100, (currentWind - 12) * 5 + derivedSnowfall * 0.35));
    transport -= derivedSnowfall * 0.25;
    transport -= Math.max(0, 60 - derivedVisibility) * 0.3;
    transport -= derivedStorm * 0.6;

    transport = Math.max(
        0,
        Math.min(100, transport)
    );

    const daysRemaining =
        resource.daily > 0
            ? resource.stock / resource.daily
            : 0;

    // The planning period inputs lived in the simulation tab. The logistics
    // projection now always looks 30 days ahead.
    const simulationDays = 30;

    const requiredResupply =
        daysRemaining < simulationDays;

    let risk = "LOW";

    if (transport < 70 || requiredResupply) {
        risk = "MEDIUM";
    }

    if (transport < 40 || daysRemaining < 7) {
        risk = "HIGH";
    }

    if (transport < 20 || daysRemaining < 2) {
        risk = "CRITICAL";
    }

    document.getElementById("resourceStock").textContent =
        resource.stock.toLocaleString("en-IN") +
        " " +
        resource.unit;

    document.getElementById("resourceDailyUse").textContent =
        resource.daily.toLocaleString("en-IN") +
        " " +
        resource.unit +
        "/day";

    document.getElementById("resourceDays").textContent =
        Math.floor(daysRemaining) +
        " days";

    const depletionDate = new Date();

    depletionDate.setDate(
        depletionDate.getDate() +
        Math.floor(daysRemaining)
    );

    const depletionDateLabel =
        depletionDate.toISOString().split("T")[0];

    document.getElementById("resourceDepletion").textContent =
        depletionDateLabel;

    document.getElementById("transportProgress").style.width =
        `${transport}%`;

    document.getElementById("transportValue").textContent =
        `${Math.round(transport)}%`;

    document.getElementById("logisticsRisk").textContent =
        risk;

    document.getElementById("routeRisk").textContent =
        risk;

    document.getElementById("routeDistance").textContent =
        "Station supply route";

    const resupplyStatus =
        document.getElementById("resupplyStatus");

    const resupplyMessage =
        document.getElementById("resupplyMessage");

    if (requiredResupply) {
        resupplyStatus.textContent =
            "Resupply Required";

        resupplyMessage.textContent =
            `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} ` +
            `will be depleted before the ${simulationDays}-day projection ends.`;
    } else {
        resupplyStatus.textContent =
            "Resupply Not Required";

        resupplyMessage.textContent =
            `Current ${resourceType} stock is sufficient for the ` +
            `${simulationDays}-day projection.`;
    }

    document.getElementById("visualLogisticsStatus").textContent =
        requiredResupply ? "RESUPPLY REQUIRED" : "STOCK SUFFICIENT";
    document.getElementById("visualLogisticsDepletion").textContent = depletionDateLabel;
    document.getElementById("visualLogisticsSummary").textContent =
        `${Math.floor(daysRemaining)} days remaining at current ${resourceType} consumption; ` +
        `transport availability is ${Math.round(transport)}%.`;
}

function windyFrameMarkup() {
    const key = JSON.stringify(WINDY_API_KEY);
    const station = JSON.stringify(stations[currentStation]);
    return `<!doctype html>
        <html><head>
            <meta charset="utf-8">
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.4.0/dist/leaflet.css">
            <style>html, body, #windy { width: 100%; height: 100%; margin: 0; }</style>
        </head><body>
            <div id="windy"></div>
            <script src="https://unpkg.com/leaflet@1.4.0/dist/leaflet.js"><\/script>
            <script>
                const parentWindow = window.parent;
                const windyKey = ${key};
                let api = null;
                let allowed = [];
                const initialStation = ${station};

                function report(type, data) {
                    parentWindow.postMessage({ source: "antarctic-windy", type, ...data }, "*");
                }

                function initialize() {
                    if (typeof windyInit !== "function") {
                        report("error", { message: "Windy Map Forecast API did not load." });
                        return;
                    }

                    windyInit({
                        key: windyKey,
                        lat: initialStation.lat,
                        lon: initialStation.lon,
                        zoom: 5,
                        overlay: "wind",
                        level: "surface",
                        product: "ecmwf"
                    }, function (windyApi) {
                        api = windyApi;
                        allowed = api.store.getAllowed("overlay") || [];
                        report("ready", { allowed });
                        api.store.set("particlesAnim", "on");
                        api.picker.open({ lat: initialStation.lat, lon: initialStation.lon });
                    });
                }

                window.addEventListener("message", function (event) {
                    if (event.source !== parentWindow || !api) return;
                    const message = event.data || {};
                    if (message.type === "station") {
                        api.map.setView([message.lat, message.lon], 5);
                        api.picker.open({ lat: message.lat, lon: message.lon });
                    }
                    if (message.type === "layer") {
                        if (!allowed.includes(message.overlay)) {
                            report("unsupported", { layer: message.layer });
                            return;
                        }
                        api.store.set("overlay", message.overlay);
                        api.store.set("particlesAnim", message.overlay === "wind" ? "on" : "off");
                    }
                });

                const windyScript = document.createElement("script");
                windyScript.src = "https://api.windy.com/assets/map-forecast/libBoot.js";
                windyScript.onload = initialize;
                windyScript.onerror = function () { report("error", { message: "Windy Map Forecast API could not be loaded." }); };
                document.body.appendChild(windyScript);
            <\/script>
        </body></html>`;
}

function initializeWindy() {
    if (windyInitialized || windyInitializing || !WINDY_API_KEY) {
        return;
    }

    const container = document.getElementById("windy");
    if (!container) {
        setEnvironmentStatus("Windy visualization unavailable - map container is missing.");
        return;
    }

    windyInitializing = true;
    const frame = document.createElement("iframe");
    frame.title = "Windy Antarctic weather forecast";
    frame.setAttribute("aria-label", "Windy Antarctic weather forecast");
    frame.srcdoc = windyFrameMarkup();
    container.replaceChildren(frame);
    windyAPI = { frame, allowed: [] };
}

function openEnvironmentMap() {
    loadWindyConfig().then(key => {
        if (!key) {
            showLeafletEnvironmentFallback();
            return;
        }

        if (windyInitialized) {
            setEnvironmentMapVisible(true);
            updateWindyStation();
            setWindyLayer(selectedEnvironmentLayer);
            return;
        }

        initializeWindy();
        setEnvironmentStatus("Loading Windy forecast visualization...", "Windy Map Forecast API");
    });
}

function updateWindyStation() {
    if (windyEmbedActive && !windyInitialized) {
        showLeafletEnvironmentFallback();
        return;
    }

    if (!windyAPI?.frame?.contentWindow) {
        return;
    }

    const data = stations[currentStation];
    windyAPI.frame.contentWindow.postMessage({
        type: "station",
        lat: data.lat,
        lon: data.lon
    }, "*");
}

function setWindyLayer(layer) {
    if (!windyAPI?.frame?.contentWindow) {
        return;
    }

    const overlayMap = {
        temperature: "temp",
        wind: "wind",
        snowfall: "snowAccu",
        pressure: "pressure",
        storm: "rain",
        visibility: "visibility"
    };

    windyAPI.frame.contentWindow.postMessage({
        type: "layer",
        layer,
        overlay: overlayMap[layer] || "wind"
    }, "*");
}

window.addEventListener("message", event => {
    if (event.source !== windyAPI?.frame?.contentWindow) {
        return;
    }

    const message = event.data || {};
    if (message.type === "ready") {
        windyInitializing = false;
        windyInitialized = true;
        windyAPI.allowed = message.allowed || [];
        setEnvironmentMapVisible(true);
        setEnvironmentStatus("Windy GFS/ECMWF forecast visualization", "Windy forecast/model");
        updateWindyStation();
        setWindyLayer(selectedEnvironmentLayer);
    }

    if (message.type === "unsupported") {
        const layerName = String(message.layer || "Selected").charAt(0).toUpperCase() +
            String(message.layer || "selected").slice(1);
        setEnvironmentStatus(
            `${layerName} layer unavailable in current Windy API tier.`,
            "Windy forecast/model"
        );
    }

    if (message.type === "error") {
        windyInitializing = false;
        windyAPI = null;
        setEnvironmentStatus("Windy visualization unavailable - API key or service error.");
        showLeafletEnvironmentFallback();
    }
});

["snow", "visibility", "storm", "wind"].forEach(id => {
    const element = document.getElementById(id);

    if (element) {
        element.addEventListener("input", updateLogistics);
        element.addEventListener("change", updateLogistics);
    }
});

document.getElementById("resourceType")?.addEventListener(
    "change",
    updateLogistics
);

updateLogistics();

function getDashboardState() {
    // Collects live weather data and key metrics from your actual DOM elements
    return {
        weather: {
            temperature: document.querySelector('[id*="temp"]')?.innerText || "N/A",
            windSpeed: document.querySelector('[id*="wind"]')?.innerText || "N/A",
            humidity: document.querySelector('[id*="humidity"]')?.innerText || "N/A",
            conditions: document.querySelector('[id*="weather"], [id*="condition"]')?.innerText || "N/A"
        },
        // Automatically collects text from visible cards/boxes without hardcoding IDs
        visibleMetrics: Array.from(document.querySelectorAll('.metric, .stat, .card, .weather-box'))
            .map(el => el.innerText.replace(/\s+/g, ' ').trim())
            .filter(text => text.length > 0)
            .slice(0, 10) // Caps data size to conserve API tokens
    };
}
// Executes UI changes commanded by Gemini
function handleUiAction(action) {
    if (!action || action.type === "NONE") return;
    
    if (action.type === "SWITCH_TAB" && action.target) {
        const tabBtn = document.querySelector(`[data-tab="${action.target}"]`);
        if (tabBtn) tabBtn.click(); // Trigger existing tab click logic
    }
}

function toggleChat() {
  const chatWindow = document.getElementById("chat-window");
  chatWindow.classList.toggle("hidden");
}

// Values arriving from the weather API may be null/undefined when Open-Meteo
// omits a variable. Number(null) is 0, so guard explicitly before coercing.
// Declared as a function (not a const arrow) so the synchronous startup path
// can call it before this point in the file is evaluated.
function weatherNumber(value) {
    return value === null || value === undefined || value === ""
        ? NaN
        : Number(value);
}

// Open-Meteo reports wind direction in degrees; the warning panel shows the
// compass point alongside the raw bearing.
function formatWindDirection(degrees) {
    if (!Number.isFinite(degrees)) {
        return null;
    }

    const compassPoints = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const normalised = ((degrees % 360) + 360) % 360;
    const point = compassPoints[Math.round(normalised / 22.5) % 16];

    return `${point} (${Math.round(normalised)}°)`;
}

// Open-Meteo reports visibility in metres. Clear-air model output can exceed
// 90 km, which is not a meaningful station reading, so the display is capped at
// 20 km while the raw metres value still drives the hazard thresholds.
function formatVisibility(metres) {
    if (!Number.isFinite(metres)) {
        return null;
    }

    if (metres >= 20000) {
        return ">20 km";
    }

    return metres < 1000
        ? `${Math.round(metres)} m`
        : `${(metres / 1000).toFixed(1)} km`;
}

// Open-Meteo reports snowfall in cm for the last hour and precipitation in mm.
function formatSnowfall(snowfall, precipitation, weatherCode) {
    const snowWeatherCodes = {
        71: "Light snow",
        73: "Moderate snow",
        75: "Heavy snow",
        77: "Snow grains",
        85: "Snow showers",
        86: "Heavy snow showers"
    };

    if (Number.isFinite(snowfall) && snowfall > 0) {
        const rate = `${snowfall.toFixed(1)} cm/h`;

        if (snowfall >= 2) return `Heavy (${rate})`;
        if (snowfall >= 0.5) return `Moderate (${rate})`;

        return `Light (${rate})`;
    }

    if (Number.isFinite(precipitation) && precipitation > 0) {
        return `${precipitation.toFixed(1)} mm/h`;
    }

    if (Number.isFinite(snowfall) || Number.isFinite(precipitation)) {
        return "None";
    }

    if (snowWeatherCodes[weatherCode]) {
        return snowWeatherCodes[weatherCode];
    }

    return null;
}

function getWeatherWarningLevel(score) {
    if (score >= 70) return "CRITICAL";
    if (score >= 45) return "WARNING";
    if (score >= 20) return "WATCH";
    return "NORMAL";
}

function calculateEarlyWeatherWarning(weather = latestWeather) {
    const temperature = Number(weather?.temperature);
    const wind = Number(weather?.wind_speed);
    const pressure = Number(weather?.pressure);
    const humidity = Number(weather?.humidity);
    const windDirection = weatherNumber(weather?.wind_direction);
    const windGusts = weatherNumber(weather?.wind_gusts);
    const snowfall = weatherNumber(weather?.snowfall);
    const precipitation = weatherNumber(weather?.precipitation);
    const weatherCode = weatherNumber(weather?.weather_code);
    const visibilityRaw = weatherNumber(weather?.visibility);
    const visibilityKm = weatherNumber(weather?.visibility_km);
    // Prefer the raw metre reading; fall back to the km value when a source
    // only supplies the converted field.
    const visibility = Number.isFinite(visibilityRaw)
        ? visibilityRaw
        : Number.isFinite(visibilityKm)
            ? visibilityKm * 1000
            : NaN;
    const hourly = weather?.hourly || {};
    const forecastTemperatures = Array.isArray(hourly.temperature) ? hourly.temperature.map(Number).filter(Number.isFinite) : [];
    const forecastWinds = Array.isArray(hourly.wind_speed) ? hourly.wind_speed.map(Number).filter(Number.isFinite) : [];
    const triggers = [];
    let score = 0;

    if (!Number.isFinite(temperature) || !Number.isFinite(wind) || !Number.isFinite(pressure)) {
        return {
            level: "UNAVAILABLE",
            score: null,
            triggers: ["Weather data unavailable"],
            headline: "Waiting for station weather data.",
            action: "Wait for the next station observation.",
            conditions: { temperature: null, wind: null, gust: null, direction: null, pressure: null, snow: null, visibility: null },
            timeline: ["Data unavailable", "Data unavailable", "Data unavailable"]
        };
    }

    if (wind >= 25) {
        score += 45;
        triggers.push(`Extreme wind (${wind.toFixed(1)} m/s)`);
    } else if (wind >= 20) {
        score += 30;
        triggers.push(`Strong wind (${wind.toFixed(1)} m/s)`);
    } else if (wind >= 15) {
        score += 15;
        triggers.push(`Elevated wind (${wind.toFixed(1)} m/s)`);
    }

    if (temperature <= -40) {
        score += 35;
        triggers.push(`Critical cold (${temperature.toFixed(1)} °C)`);
    } else if (temperature <= -30) {
        score += 24;
        triggers.push(`Extreme cold (${temperature.toFixed(1)} °C)`);
    } else if (temperature <= -25) {
        score += 12;
        triggers.push(`Low temperature (${temperature.toFixed(1)} °C)`);
    }

    const nextSixHours = forecastTemperatures.slice(0, 6);
    const forecastDrop = nextSixHours.length ? Math.min(...nextSixHours) - temperature : 0;
    if (forecastDrop <= -5) {
        score += 20;
        triggers.push(`Rapid temperature decrease (${forecastDrop.toFixed(1)} °C forecast)`);
    }

    if (pressure <= 950 && wind >= 20) {
        score += 35;
        triggers.push(`Low pressure with strong wind (${pressure.toFixed(0)} hPa)`);
    } else if (pressure <= 965 && wind >= 18) {
        score += 20;
        triggers.push(`Low pressure and elevated wind (${pressure.toFixed(0)} hPa)`);
    }

    const forecastMaxWind = forecastWinds.length ? Math.max(...forecastWinds.slice(0, 24)) : wind;
    if (forecastMaxWind >= 25 && wind < 25) {
        score += 18;
        triggers.push(`Forecast wind escalation to ${forecastMaxWind.toFixed(1)} m/s`);
    }

    if (windGusts >= 30) {
        score += 15;
        triggers.push(`Severe wind gusts (${windGusts.toFixed(1)} m/s)`);
    } else if (windGusts >= 20) {
        score += 8;
        triggers.push(`Strong wind gusts (${windGusts.toFixed(1)} m/s)`);
    }

    if (snowfall >= 2) {
        score += 18;
        triggers.push(`Heavy snowfall (${snowfall.toFixed(1)} cm/h)`);
    } else if (snowfall >= 0.5) {
        score += 8;
        triggers.push(`Snowfall (${snowfall.toFixed(1)} cm/h)`);
    }

    if (visibility <= 1000) {
        score += 20;
        triggers.push(`Blizzard visibility (${formatVisibility(visibility)})`);
    } else if (visibility <= 2000) {
        score += 6;
        triggers.push(`Reduced visibility (${formatVisibility(visibility)})`);
    }

    const level = getWeatherWarningLevel(Math.min(100, score));
    const headline = level === "CRITICAL"
        ? "Severe weather conditions detected."
        : level === "WARNING"
            ? "Deteriorating conditions may affect station operations."
            : level === "WATCH"
                ? "Wind or cold conditions are increasing."
                : "Current conditions are within assessed operating limits.";
    const action = level === "CRITICAL"
        ? "Restrict outdoor activity and secure exposed equipment."
        : level === "WARNING"
            ? "Prepare for deteriorating conditions and review outdoor work plans."
            : level === "WATCH"
                ? "Monitor the next forecast update and review outdoor operations."
                : "Continue routine monitoring of station conditions.";

    return {
        level,
        score: Math.min(100, score),
        triggers: triggers.length ? triggers : ["No dangerous weather trigger detected"],
        headline,
        action,
        conditions: {
            temperature,
            wind,
            gust: Number.isFinite(windGusts) ? windGusts : null,
            direction: formatWindDirection(windDirection),
            pressure,
            snow: formatSnowfall(snowfall, precipitation, weatherCode),
            visibility: formatVisibility(visibility),
            humidity
        },
        timeline: [
            level,
            forecastMaxWind >= 25 || forecastDrop <= -5 ? "Escalating" : level,
            forecastMaxWind >= 25 || forecastDrop <= -5 ? "Monitor closely" : "No major escalation"
        ]
    };
}

function clearEarlyWarningMapLayer() {
    if (earlyWarningMapLayer && map) {
        map.removeLayer(earlyWarningMapLayer);
    }
    earlyWarningMapLayer = null;
}

function updateEarlyWarningMapLayer(warning) {
    if (!map) return;
    clearEarlyWarningMapLayer();
    if (warning.level === "UNAVAILABLE" || !Number.isFinite(warning.conditions.temperature)) return;
    const colors = { NORMAL: "#4c8a70", WATCH: "#c59a4a", WARNING: "#c57d3e", CRITICAL: "#b64f4f" };
    const color = colors[warning.level] || colors.NORMAL;
    const position = getCurrentStationPosition();
    earlyWarningMapLayer = L.layerGroup([
        L.circle(position, { radius: warning.level === "CRITICAL" ? 30000 : 22000, color, fillColor: color, fillOpacity: 0.12, weight: 3, dashArray: warning.level === "NORMAL" ? "4 7" : "8 5" }),
        L.circleMarker(position, { radius: warning.level === "CRITICAL" ? 12 : 9, color, fillColor: "#ffffff", fillOpacity: 1, weight: 3 })
    ]).addTo(map);
}

function renderEarlyWarningPanel(warning) {
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    const summary = document.getElementById("earlyWarningSummary");
    if (summary) summary.className = `early-warning-summary ${warning.level.toLowerCase()}`;
    setText("earlyWarningStation", stations[currentStation]?.code || currentStation.toUpperCase());
    setText("earlyWarningLevel", warning.level);
    setText("earlyWarningHeadline", warning.headline);
    setText("earlyWarningTemperature", Number.isFinite(warning.conditions.temperature) ? `${warning.conditions.temperature.toFixed(1)} °C` : "Data unavailable");
    setText("earlyWarningWind", Number.isFinite(warning.conditions.wind) ? `${warning.conditions.wind.toFixed(1)} m/s` : "Data unavailable");
    setText("earlyWarningDirection", warning.conditions.direction || "Data unavailable");
    setText("earlyWarningPressure", Number.isFinite(warning.conditions.pressure) ? `${warning.conditions.pressure.toFixed(0)} hPa` : "Data unavailable");
    setText("earlyWarningSnow", warning.conditions.snow || "Data unavailable");
    setText("earlyWarningVisibility", warning.conditions.visibility || "Data unavailable");
    setText("earlyWarningAction", warning.action);
    const triggers = document.getElementById("earlyWarningTriggers");
    if (triggers) triggers.innerHTML = warning.triggers.map(trigger => `<li>${trigger}</li>`).join("");
    const timeline = document.getElementById("earlyWarningTimeline");
    if (timeline) timeline.querySelectorAll("span").forEach((item, index) => { item.querySelector("em").textContent = warning.timeline[index] || "Data unavailable"; });
    setText("visualEarlyWarningLevel", warning.level);
    setText("visualEarlyWarningMessage", warning.triggers.join(" "));
    setText("visualEarlyWarningAction", `Recommended action: ${warning.action}`);
}

function updateEarlyWarningSystem() {
    const warning = calculateEarlyWeatherWarning(latestWeather);
    renderEarlyWarningPanel(warning);
    updateEarlyWarningMapLayer(warning);
    return warning;
}


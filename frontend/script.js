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
let simulationMapOverlay;
let openMeteoForecastLayer;
let earlyWarningMapLayer = null;
let weatherArea;
let weatherChart;
let simulationRunning = false;

let latestSimulation = null;
let latestWeather = null;
let stationInfrastructure = [];
const infrastructureStorageKey = "antarcticStationInfrastructure";

let simulationEnergyChart = null;
let simulationFuelChart = null;
let simulationRiskChart = null;
let windyAPI = null;
let windyInitialized = false;
let windyInitializing = false;
let windyConfigLoaded = false;
let WINDY_API_KEY = "";
let selectedEnvironmentLayer = "temperature";
let windyEmbedActive = false;

let infrastructure3DScene = null;
let infrastructure3DCamera = null;
let infrastructure3DRenderer = null;
let infrastructure3DControls = null;
let infrastructure3DRaycaster = null;
let infrastructure3DMouse = null;
let infrastructure3DGroup = null;
let infrastructure3DInitialized = false;
let infrastructure3DObjects = [];
let infrastructure3DHovered = null;

let infrastructureDamageSimulation = {
    active: false,
    scenario: "weather",
    duration: 24,
    results: {}
};

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

function clearSimulationMapOverlay() {
    if (simulationMapOverlay && map) {
        map.removeLayer(simulationMapOverlay);
    }

    simulationMapOverlay = null;
    document.getElementById("simulationMapCard")?.classList.add("hidden");
}

function updateSimulationMapOverlay() {
    if (!map || !latestSimulation) {
        return;
    }

    clearSimulationMapOverlay();

    const position = getCurrentStationPosition();
    const risk = Math.round(latestSimulation.peakRisk);
    const riskColor = risk >= 70 ? "#b64f4f" : risk >= 40 ? "#c58a4a" : "#4c8a70";
    const transport = Math.round(latestSimulation.minimumTransport);

    simulationMapOverlay = L.layerGroup([
        L.circle(position, {
            radius: 18000 + risk * 900,
            color: riskColor,
            fillColor: riskColor,
            fillOpacity: 0.18,
            weight: 2
        }),
        L.circleMarker(position, {
            radius: 10,
            color: riskColor,
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 3
        })
    ]).addTo(map);

    const riskElement = document.getElementById("mapSimulationRisk");
    const detailsElement = document.getElementById("mapSimulationDetails");
    if (riskElement) {
        riskElement.textContent = `${riskLabel(risk)} risk - ${risk}/100`;
    }
    if (detailsElement) {
        detailsElement.textContent =
            `${latestSimulation.days}-day projection | Transport ${transport}% | ` +
            `Fuel remaining ${Math.round(latestSimulation.fuelRemaining).toLocaleString("en-IN")} L`;
    }
    document.getElementById("simulationMapCard")?.classList.remove("hidden");
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

    const environmentStation = document.getElementById("visualEnvironmentStation");
    if (environmentStation) {
        environmentStation.textContent = data.name;
    }

    updateSimulationBaseline();

    if (latestSimulation?.station && latestSimulation.station !== currentStation) {
        latestSimulation = null;
        clearSimulationMapOverlay();
    }

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
    updateInfrastructureHealthMonitor();

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
        if (!requiredWeatherValues.every(value => Number.isFinite(Number(value)))) {
            throw new Error("Weather API returned incomplete or non-numeric weather data");
        }
        latestWeather = weather;

        updateWeatherVisualization(weather);
        updateSimulationBaseline();

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
            mapDataStatus.textContent = weather.source === "NCPOR"
                ? "NCPOR observation + Open-Meteo forecast overlay"
                : "NCPOR unavailable - fallback/model data";
        }

        updateWeatherChart(weather.hourly, weather);
        updateOpenMeteoMapLayer(weather);
        updateSimulationBaseline();
        updateInfrastructureHealthMonitor();
        updateEarlyWarningSystem();

        updateLogistics();
        const activeLayer = document.querySelector(".layer-button.active")?.dataset.layer;
        if (activeLayer && document.getElementById("environmentPanel")?.classList.contains("panel-content") &&
            !document.getElementById("environmentPanel")?.classList.contains("hidden")) {
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
        updateSimulationBaseline();
        updateInfrastructureHealthMonitor();
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

function updateSimulationBaseline() {
    const station = stations[currentStation];
    const values = {
        simulationBaselineStation: station.name,
        simulationBaselineTemperature: `${formatNumber(latestWeather?.temperature)} °C`,
        simulationBaselineWind: `${formatNumber(latestWeather?.wind_speed)} m/s`,
        simulationBaselineSource: latestWeather?.hourly_source ||
            (latestWeather?.source === "NCPOR" ? "NCPOR observation" : "Waiting for weather")
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
}

function updateWeatherVisualization(weather) {
    const data = weather || {};
    const station = stations[currentStation];
    const source = data.source || "Weather data unavailable";
    const isObservation = source === "NCPOR";
    const temperature = Number(data.temperature);
    const wind = Number(data.wind_speed);
    const pressure = Number(data.pressure);
    const humidity = Number(data.humidity);
    const values = {
        visualWeatherStation: station.name,
        visualWeatherStatus: isObservation ? "NCPOR observation" : source,
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

    if (panelId === "simulationPanel") {
        document.getElementById("simulationVisualization")
            ?.classList.remove("hidden");
    }

    if (panelId === "logisticsPanel") {
        document.getElementById("logisticsVisualization")
            ?.classList.remove("hidden");
    }

    if (panelId === "infrastructurePanel") {
        document.getElementById("infrastructureVisualization")
            ?.classList.remove("hidden");
    }

    if (panelId === "environmentPanel") {
        document.getElementById("environmentVisualization")
            ?.classList.remove("hidden");
    }
}

function setEnvironmentMapVisible(visible) {
    const mapArea = document.querySelector(".map-area");
    if (!mapArea) {
        return;
    }

    mapArea.classList.toggle("windy-active", visible && (windyInitialized || windyEmbedActive));
    if (map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

function setEnvironmentStatus(message, source = "Windy Map Forecast API") {
    const status = document.getElementById("visualEnvironmentStatus");
    const sourceElement = document.getElementById("visualEnvironmentSource");
    if (status) {
        status.textContent = message;
    }
    if (sourceElement) {
        sourceElement.textContent = source;
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

            if (panelId === "environmentPanel") {
                setInfrastructure3DVisible(false);
                updateEarlyWarningSystem();
                openEnvironmentMap();
            } else if (panelId === "infrastructurePanel") {
                clearEnvironmentEffect();
                clearEarlyWarningMapLayer();
                setEnvironmentMapVisible(false);
                setInfrastructure3DVisible(true);
            } else {
                clearEnvironmentEffect();
                clearEarlyWarningMapLayer();
                setEnvironmentMapVisible(false);
                setInfrastructure3DVisible(false);
            }

            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                }
            }, 200);
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

        setEnvironmentMapVisible(false);

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
    } else {
        activateEnvironmentLayer(layer);
    }

    const visualLayer =
        document.getElementById("visualEnvironmentLayer");

    const visualValue =
        document.getElementById("visualEnvironmentValue");

    if (visualLayer) {
        visualLayer.textContent =
            layer === "snowfall"
                ? "Snowfall"
                : layer.charAt(0).toUpperCase() +
                  layer.slice(1);
    }

    if (visualValue) {
        const temp =
            document.getElementById("liveTemperature")?.textContent || "--";

        const wind =
            document.getElementById("liveWind")?.textContent || "--";

        if (layer === "temperature") {
            visualValue.textContent = `${temp} °C`;
        } else if (layer === "wind") {
            visualValue.textContent = `${wind} m/s`;
        } else {
            visualValue.textContent = getEnvironmentValue(layer);
        }
    }

    const source = document.getElementById("visualEnvironmentSource");
    const status = document.getElementById("visualEnvironmentStatus");
    const station = document.getElementById("visualEnvironmentStation");
    if (source && !windyInitialized && !windyEmbedActive) {
        source.textContent = latestWeather?.source || "Awaiting weather data";
    }
    if (status) {
        status.textContent = windyInitialized || windyEmbedActive
            ? "Windy forecast/model visualization; NCPOR observation shown as reference"
            : latestWeather?.source === "NCPOR"
            ? "Latest NCPOR observation"
            : "Model estimate used for local fallback visualization";
    }
    if (station) {
        station.textContent = stations[currentStation].name;
    }
}

function getEnvironmentValue(layer) {
    const weather = latestWeather || {};
    const temperature = Number.isFinite(Number(weather.temperature)) ? Number(weather.temperature) : -18;
    const wind = Number.isFinite(Number(weather.wind_speed)) ? Number(weather.wind_speed) : 8;
    const pressure = Number.isFinite(Number(weather.pressure)) ? Number(weather.pressure) : 985;
    const snowfall = Math.max(0, Math.min(100, 25 + Math.max(0, (-temperature - 10) * 1.8)));
    const visibility = Math.max(15, 100 - snowfall * 0.55);
    const storm = Math.max(0, Math.min(100, (wind - 12) * 5 + snowfall * 0.35));
    const values = {
        snowfall: `${snowfall.toFixed(0)} index`,
        visibility: `${visibility.toFixed(0)}% estimated`,
        storm: `${storm.toFixed(0)} / 100 estimated`,
        pressure: `${formatNumber(pressure)} hPa`
    };

    return values[layer] || "Current station conditions";
}

let simulationMode = "emergency";

const simulationModes =
    document.querySelectorAll(".simulation-mode");

const simulationInputTitle =
    document.getElementById("simulationInputTitle");

const simulationInputDescription =
    document.getElementById("simulationInputDescription");

const simulationBasis =
    document.getElementById("simulationBasis");

simulationModes.forEach(button => {
    button.addEventListener("click", () => {

        simulationModes.forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        simulationMode = button.dataset.mode;

        updateSimulationMode();
    });
});

function updateSimulationMode() {

    if (!simulationInputTitle ||
        !simulationInputDescription ||
        !simulationBasis) {
        return;
    }

    document.querySelectorAll(".scenario-field").forEach(field => {
        field.classList.add("hidden");
    });

    document.querySelectorAll(`.${simulationMode}-field`).forEach(field => {
        field.classList.remove("hidden");
    });

    if (simulationMode === "emergency") {

        simulationInputTitle.textContent =
            "Emergency Response Inputs";

        simulationInputDescription.textContent =
            "Assess station response to weather and emergency conditions.";

        simulationBasis.textContent =
            "Daily environmental conditions affect heating demand, power generation, fuel consumption, transport availability and operational risk.";
    }

    else if (simulationMode === "climate") {

        simulationInputTitle.textContent =
            "Climate Risk Assessment";

        simulationInputDescription.textContent =
            "Measure how environmental risk changes across the selected period.";

        simulationBasis.textContent =
            "The simulation identifies recurring high-risk conditions and their effect on station energy and logistics.";
    }

    else if (simulationMode === "infrastructure") {

        simulationInputTitle.textContent =
            "Infrastructure Planning";

        simulationInputDescription.textContent =
            "Estimate how planned infrastructure improves energy resilience.";

        simulationBasis.textContent =
            "Added solar, wind, battery and other infrastructure is included in the station simulation.";
    }
}

function getSimulationDays(startDate, endDate) {

    const start = new Date(startDate);
    const end = new Date(endDate);

    return Math.max(
        1,
        Math.floor(
            (end - start) /
            (1000 * 60 * 60 * 24)
        ) + 1
    );
}

function initializeSimulationDates() {
    const startInput = document.getElementById("startDate");
    const endInput = document.getElementById("endDate");
    if (!startInput || !endInput) return;

    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + 29);
    const toInputDate = date => date.toISOString().split("T")[0];

    startInput.value = toInputDate(today);
    endInput.value = toInputDate(end);
}

function getBaseConditions() {

    const temperature =
        Number.parseFloat(
            document.getElementById("liveTemperature")?.textContent
        );

    const wind =
        Number.parseFloat(
            document.getElementById("liveWind")?.textContent
        );

    const pressure =
        Number.parseFloat(
            document.getElementById("livePressure")?.textContent
        );

    const humidity =
        Number.parseFloat(
            document.getElementById("liveHumidity")?.textContent
        );

    return {
        temperature:
            Number.isFinite(temperature)
                ? temperature
                : -18,

        wind:
            Number.isFinite(wind)
                ? wind
                : 8,

        pressure:
            Number.isFinite(pressure)
                ? pressure
                : 985,

        humidity:
            Number.isFinite(humidity)
                ? humidity
                : 60
    };
}

function generateDailyConditions(startDate, days) {

    const base = getBaseConditions();
    const conditions = [];

    for (let i = 0; i < days; i++) {

        const date = new Date(startDate);

        date.setDate(
            date.getDate() + i
        );

        const temperature =
            base.temperature +
            Math.sin(i / 9) * 4 +
            Math.sin(i * 1.7) * 2;

        const wind =
            Math.max(
                1,
                base.wind +
                Math.sin(i / 4) * 5 +
                Math.cos(i * 1.3) * 3
            );

        const coldFactor =
            Math.max(
                0,
                (-temperature - 10) / 30
            );

        const snowfall =
            Math.max(
                0,
                Math.min(
                    100,
                    18 +
                    Math.max(0, (base.humidity - 50) * 0.35) +
                    coldFactor * 35 +
                    Math.sin(i * 1.4) * 20
                )
            );

        const visibility =
            Math.max(
                15,
                Math.min(
                    100,
                    95 -
                    snowfall * 0.55
                )
            );

        const storm =
            Math.max(
                0,
                Math.min(
                    100,
                    (wind - 12) * 5 +
                    snowfall * 0.35
                )
            );

        conditions.push({
            date:
                date.toISOString().split("T")[0],

            temperature,
            wind,
            snowfall,
            visibility,
            storm
        });
    }

    return conditions;
}

function calculateDailyRisk(condition) {

    let score = 0;

    if (condition.temperature <= -35) {
        score += 25;
    }
    else if (condition.temperature <= -25) {
        score += 15;
    }

    if (condition.wind >= 25) {
        score += 25;
    }
    else if (condition.wind >= 18) {
        score += 15;
    }

    if (condition.snowfall >= 70) {
        score += 20;
    }
    else if (condition.snowfall >= 45) {
        score += 10;
    }

    if (condition.visibility <= 30) {
        score += 20;
    }
    else if (condition.visibility <= 50) {
        score += 10;
    }

    if (condition.storm >= 70) {
        score += 30;
    }
    else if (condition.storm >= 40) {
        score += 15;
    }

    return Math.min(100, score);
}

function riskLabel(score) {

    if (score >= 70) {
        return "CRITICAL";
    }

    if (score >= 40) {
        return "WARNING";
    }

    return "NORMAL";
}

function getInfrastructureSimulationImpact() {
    let renewableEnergy = 0;
    let batteryCapacity = 0;
    let dieselCapacity = 0;
    let fuelStorage = 0;
    let waterCapacity = 0;

    if (typeof stationInfrastructure === "undefined") {
        return {
            renewableEnergy: 0,
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
        batteryCapacity,
        dieselCapacity,
        fuelStorage,
        waterCapacity
    };
}

function runDigitalTwinSimulation() {

    const startDate =
        document.getElementById("startDate")?.value;

    const endDate =
        document.getElementById("endDate")?.value;

    if (!startDate || !endDate) {
        alert("Select a start date and end date.");
        return;
    }

    if (startDate > endDate) {
        alert("End date must be after start date.");
        return;
    }

    const days = getSimulationDays(startDate, endDate);
    if (days > 365) {
        alert("Select a simulation period of 365 days or less.");
        return;
    }

    const personnel =
        Number(
            document.getElementById("personnel")?.value || 45
        );

    const dailyEnergy =
        Number(
            document.getElementById("dailyEnergy")?.value || 1200
        );

    const initialFuel =
        Number(
            document.getElementById("fuelStock")?.value || 10000
        );

    const waterStock =
        Number(
            document.getElementById("waterStock")?.value || 6000
        );

    const foodStock = Number(document.getElementById("foodStock")?.value || 3000);
    const medicalStock = Number(document.getElementById("medicalStock")?.value || 500);

    const emergencySeverity =
        document.getElementById("emergencySeverity")?.value || "normal";

    const emergencyFactor = {
        normal: 0,
        severe: 12,
        critical: 25
    }[emergencySeverity];

    const transportBaseline = Math.max(
        0,
        Math.min(100, Number(document.getElementById("transportAvailability")?.value || 85))
    );

    const temperatureSensitivity = Number(
        document.getElementById("temperatureSensitivity")?.value || 1
    );

    const windSensitivity = Number(
        document.getElementById("windSensitivity")?.value || 1
    );

    const snowfallSensitivity = simulationMode === "climate"
        ? Math.max(0, Number(document.getElementById("snowfallSensitivity")?.value || 1))
        : 1 + Math.max(0, temperatureSensitivity - 1) * 0.25;
    const stormSensitivity = simulationMode === "climate"
        ? Math.max(0, Number(document.getElementById("stormSensitivity")?.value || 1))
        : 1 + Math.max(0, windSensitivity - 1) * 0.25;
    const baselineRisk = simulationMode === "climate"
        ? Math.max(0, Number(document.getElementById("baselineRisk")?.value || 0))
        : 0;
    const utilization = Math.max(
        0,
        Math.min(100, Number(document.getElementById("expectedUtilization")?.value || 80))
    ) / 100;
    const projectLifetime = Math.max(
        1,
        Number(document.getElementById("projectLifetime")?.value || 20)
    );

    const dailyConditions =
        generateDailyConditions(
            startDate,
            days
        );

    const infrastructure =
        getInfrastructureSimulationImpact();

    const planningType = document.getElementById("planningInfrastructureType")?.value;
    const planningCapacity = Math.max(0, Number(document.getElementById("planningCapacity")?.value || 0));
    const planningData = typeof infrastructureData !== "undefined" && planningType
        ? infrastructureData[planningType]
        : null;
    const plannedRenewableEnergy = simulationMode === "infrastructure" && planningData &&
        (planningType === "solar" || planningType === "wind")
        ? planningCapacity * planningData.energyPerUnit * utilization
        : 0;
    const plannedFuelStorage = simulationMode === "infrastructure" && planningType === "fuel"
        ? planningCapacity
        : 0;
    const plannedBatteryCapacity = simulationMode === "infrastructure" && planningType === "battery"
        ? planningCapacity
        : 0;
    const modeledEnergyRequirement = simulationMode === "infrastructure"
        ? Math.max(100, Number(document.getElementById("infrastructureEnergyRequirement")?.value || dailyEnergy))
        : dailyEnergy;
    const installationCost = simulationMode === "infrastructure"
        ? Math.max(0, Number(document.getElementById("installationCost")?.value || 0))
        : 0;

    let fuelRemaining = initialFuel + infrastructure.fuelStorage + plannedFuelStorage;
    let waterRemaining = waterStock + infrastructure.waterCapacity;
    let foodRemaining = foodStock;
    let medicalRemaining = medicalStock;
    let totalFuelUsed = 0;
    let totalEnergyDemand = 0;
    let totalRenewableEnergy = 0;
    let peakRisk = 0;
    let highRiskDays = 0;
    let minimumTransport = 100;
    let peakResourceRisk = 0;
    const resourceAlerts = new Set();

    const dailyWaterUse = Math.max(1, personnel * (1.8 + emergencyFactor * 0.02) - infrastructure.waterCapacity * 0.01);
    const dailyFoodUse = Math.max(1, personnel * 2.2 * (1 + emergencyFactor * 0.01));
    const dailyMedicalUse = Math.max(0.1, personnel * 0.02 * (1 + emergencyFactor * 0.02));

    const simulationLabels = [];
    const simulationEnergy = [];
    const simulationFuel = [];
    const simulationRisk = [];

    dailyConditions.forEach(condition => {

        let risk =
            calculateDailyRisk(condition);

        if (simulationMode === "emergency") {
            risk = Math.min(
                100,
                risk + emergencyFactor
            );
        }

        if (simulationMode === "climate") {
            const coldRisk = condition.temperature <= -25 ? 5 * temperatureSensitivity : 0;
            const windRisk = condition.wind >= 18 ? 5 * windSensitivity : 0;
            risk = Math.min(100, risk + coldRisk + windRisk);
        }

        risk = Math.min(100, risk + emergencyFactor * 0.35 + baselineRisk);

        const heatingFactor =
            Math.max(
                0,
                (-condition.temperature - 10) / 30
            );

        const energyDemand =
            modeledEnergyRequirement *
            (
                1 +
                heatingFactor * 0.35 +
                (simulationMode === "emergency" ? emergencyFactor * 0.006 : 0)
            );

        totalEnergyDemand +=
            energyDemand;

        const weatherRenewableFactor =
            Math.max(
                0.15,
                Math.min(
                    0.85,
                    0.65 -
                    condition.snowfall * 0.003 +
                    condition.wind * 0.004
                )
            );

            let renewableEnergy =
                (infrastructure.renewableEnergy + plannedRenewableEnergy) * weatherRenewableFactor;

            const batterySupport =
                Math.min((infrastructure.batteryCapacity + plannedBatteryCapacity) / Math.max(1, days), energyDemand * 0.2);

            renewableEnergy += batterySupport;

            renewableEnergy =
                Math.min(
                    energyDemand,
                    renewableEnergy
                );

            totalRenewableEnergy +=
                renewableEnergy;

            const dieselEnergy =
                Math.max(
                    0,
                    energyDemand -
                    renewableEnergy
                );

            const fuelUsed = dieselEnergy / 10;

        totalFuelUsed +=
            fuelUsed;

        fuelRemaining =
            Math.max(
                0,
                fuelRemaining -
                fuelUsed
            );

        waterRemaining = Math.max(0, waterRemaining - dailyWaterUse);
        foodRemaining = Math.max(0, foodRemaining - dailyFoodUse);
        medicalRemaining = Math.max(0, medicalRemaining - dailyMedicalUse);

        let resourceRisk = 0;
        const resourceDays = {
            fuel: fuelUsed > 0 ? fuelRemaining / fuelUsed : Infinity,
            water: waterRemaining / dailyWaterUse,
            food: foodRemaining / dailyFoodUse,
            medical: medicalRemaining / dailyMedicalUse
        };

        Object.entries(resourceDays).forEach(([resource, remainingDays]) => {
            if (remainingDays <= 2) {
                resourceRisk += 20;
                resourceAlerts.add(`${resource} critical`);
            } else if (remainingDays <= 7) {
                resourceRisk += 12;
                resourceAlerts.add(`${resource} low`);
            } else if (remainingDays <= 14) {
                resourceRisk += 5;
            }
        });

        if (renewableEnergy < energyDemand * 0.35) {
            resourceRisk += 5;
            resourceAlerts.add("power reserve low");
        }

        resourceRisk = Math.min(40, resourceRisk);
        risk = Math.min(100, risk + resourceRisk);
        peakResourceRisk = Math.max(peakResourceRisk, resourceRisk);

        peakRisk = Math.max(peakRisk, risk);
        if (risk >= 40) highRiskDays++;

        simulationLabels.push(condition.date);
        simulationEnergy.push(Math.round(energyDemand));
        simulationFuel.push(Math.round(fuelUsed));
        simulationRisk.push(Math.round(risk));

        let transport =
            transportBaseline;

        transport -=
            condition.storm * 0.6 * stormSensitivity;

        transport -=
            condition.snowfall * 0.25 * snowfallSensitivity;

        transport -= emergencyFactor * 0.35;

        transport -=
            Math.max(
                0,
                condition.wind - 40
            ) * 0.4;

        transport -=
            Math.max(
                0,
                60 - condition.visibility
            ) * 0.3;

        transport =
            Math.max(
                0,
                Math.min(100, transport)
            );

        minimumTransport =
            Math.min(
                minimumTransport,
                transport
            );
    });

    const averageEnergy =
        totalEnergyDemand / days;

    const averageRenewable =
        totalRenewableEnergy / days;

    const resourceRiskLabel = riskLabel(peakResourceRisk);
    const resourceAlert = resourceAlerts.size > 0
        ? Array.from(resourceAlerts).slice(0, 3).join(", ")
        : "Resources adequate";

    const extremeWeatherDays = dailyConditions.filter(condition =>
        condition.temperature <= -30 ||
        condition.wind >= 25 ||
        condition.storm >= 70
    ).length;

    let resupply = "NOT REQUIRED";

    const resourceResupplyRequired =
        fuelRemaining <= 0 ||
        waterRemaining <= 0 ||
        foodRemaining <= 0 ||
        medicalRemaining <= 0;

    if (resourceResupplyRequired) {
        resupply = "URGENT";
    }
    else if (
        fuelRemaining <
        (averageEnergy / 10) * 7
    ) {
        resupply = "RECOMMENDED";
    }

    if (
        simulationMode === "emergency" &&
        peakRisk >= 70
    ) {
        resupply = "URGENT";
    }

    const risk =
        riskLabel(peakRisk);

    document.getElementById(
        "simulationResultRisk"
    ).textContent = risk;

    document.getElementById(
        "simulationPeakRisk"
    ).textContent =
        `${Math.round(peakRisk)} / 100`;

    document.getElementById(
        "simulationEnergyDemand"
    ).textContent =
        `${Math.round(averageEnergy).toLocaleString("en-IN")} kWh/day`;

    document.getElementById(
        "simulationFuelUse"
    ).textContent =
        `${Math.round(totalFuelUsed).toLocaleString("en-IN")} L`;

    document.getElementById(
        "simulationFuelRemaining"
    ).textContent =
        `${Math.round(fuelRemaining).toLocaleString("en-IN")} L`;

    document.getElementById(
        "simulationResupply"
    ).textContent =
        resupply;

    document.getElementById("simulationAverageRisk").textContent =
        `${Math.round(simulationRisk.reduce((sum, value) => sum + value, 0) / days)} / 100`;

    document.getElementById("simulationExtremeDays").textContent =
        `${extremeWeatherDays} days`;

    document.getElementById("simulationResourceRisk").textContent =
        `${resourceRiskLabel} - ${Math.round(peakResourceRisk)}/40`;

    document.getElementById("simulationResourceAlert").textContent =
        resourceAlert;

    document.getElementById(
        "simulationSummaryTitle"
    ).textContent =
        `${risk} — ${days}-day simulation`;

    let modeText = "Station response";

    if (simulationMode === "climate") {
        modeText = "Climate risk assessment";
    }

    if (simulationMode === "infrastructure") {
        modeText = "Infrastructure planning";
    }

    const infrastructureDetail = simulationMode === "infrastructure"
        ? ` Planned ${planningType || "asset"} capacity: ${planningCapacity.toLocaleString("en-IN")} ` +
          `with ${utilization * 100}% utilization and ₹${installationCost.toLocaleString("en-IN")} installation cost.`
        : "";

    document.getElementById(
        "simulationLogisticsImpact"
    ).textContent =
        `${modeText}: ${highRiskDays} high-risk days detected. ` +
        `Minimum transport availability was ${Math.round(minimumTransport)}%. ` +
        `Average renewable generation was ${Math.round(averageRenewable).toLocaleString("en-IN")} kWh/day. ` +
        `Fuel consumption was approximately ${Math.round(totalFuelUsed).toLocaleString("en-IN")} L ` +
        `for ${personnel} personnel. ` +
        `Water remaining: ${Math.round(waterRemaining).toLocaleString("en-IN")} L. ` +
        `Resource status: ${resourceAlert}. ` +
        infrastructureDetail +
        `${resourceResupplyRequired ? "Resupply is required before the period ends." : "All modeled reserves last through the period."}`;

    if (mapDataStatus) {
        mapDataStatus.textContent =
            `Simulation complete — ${days} days`;
    }

    updateInfrastructureSimulationImpact(
        totalEnergyDemand,
        totalFuelUsed
    );

    latestSimulation = {
        station: currentStation,
        days,
        initialFuel,
        projectedFuelStock: initialFuel + infrastructure.fuelStorage + plannedFuelStorage,
        totalFuelUsed,
        fuelRemaining,
        dailyFuelUse: totalFuelUsed / days,
        peakRisk,
        highRiskDays,
        minimumTransport,
        averageEnergy,
        averageRisk: simulationRisk.reduce((sum, value) => sum + value, 0) / days,
        extremeWeatherDays,
        waterRemaining,
        foodRemaining,
        medicalRemaining,
        peakResourceRisk,
        resourceAlert,
        resourceResupplyRequired,
        plannedInfrastructureType: planningType || null,
        plannedCapacity: planningCapacity,
        installationCost,
        modeledEnergyRequirement,
        projectLifetime,
        emergencySeverity
    };

    updateInfrastructureHealthMonitor();
    updateSimulationMapOverlay();

    updateSimulationVisualization(
        simulationLabels,
        simulationEnergy,
        simulationFuel,
        simulationRisk,
        peakRisk,
        averageEnergy,
        totalFuelUsed,
        highRiskDays
    );

    updateLogistics();
}

function updateInfrastructureSimulationImpact(
    totalEnergyDemand,
    totalFuelUsed
) {

    const impactCost =
        document.querySelectorAll("#infraCost")[1];

    const impactEnergy =
        document.querySelectorAll("#infraEnergy")[1];

    const impactFuel =
        document.querySelectorAll("#infraFuelSaved")[1];

    const impactCO2 =
        document.querySelectorAll("#infraCO2")[1];

    if (!impactCost ||
        !impactEnergy ||
        !impactFuel ||
        !impactCO2) {
        return;
    }

    const infrastructure =
        getInfrastructureSimulationImpact();

    const totalCost =
        typeof stationInfrastructure !== "undefined"
            ? stationInfrastructure.reduce(
                (sum, item) => sum + item.cost,
                0
            )
            : 0;

    const fuelSaved = Math.min(
        infrastructure.renewableEnergy / 10,
        totalFuelUsed
    );

    const co2Reduction =
        fuelSaved * 2.68;

    impactCost.textContent =
        "₹" +
        Math.round(totalCost)
            .toLocaleString("en-IN");

    impactEnergy.textContent =
        Math.round(
            infrastructure.renewableEnergy
        ).toLocaleString("en-IN") +
        " kWh/day";

    impactFuel.textContent =
        fuelSaved.toFixed(1) +
        " L/day";

    impactCO2.textContent =
        co2Reduction.toFixed(1) +
        " kg/day";

    document.getElementById("visualInfraCost").textContent = impactCost.textContent;
    document.getElementById("visualInfraEnergy").textContent = impactEnergy.textContent;
    document.getElementById("visualInfraFuel").textContent = impactFuel.textContent;
    document.getElementById("visualInfraCO2").textContent = impactCO2.textContent;
    document.getElementById("visualInfraSummary").textContent =
        `${Math.round(infrastructure.batteryCapacity).toLocaleString("en-IN")} kWh battery support and ` +
        `${Math.round(infrastructure.fuelStorage).toLocaleString("en-IN")} L additional fuel storage are included in the scenario.`;
}

function updateSimulationVisualization(
    labels,
    energy,
    fuel,
    risk,
    peakRisk,
    averageEnergy,
    totalFuelUsed,
    highRiskDays
) {
    const period = document.getElementById("visualizationPeriod");
    const visualRisk = document.getElementById("visualRisk");
    const summary = document.getElementById("visualSimulationSummary");

    const startDate = document.getElementById("startDate")?.value;
    const endDate = document.getElementById("endDate")?.value;

    if (period) {
        period.textContent = `${startDate} → ${endDate}`;
    }

    if (visualRisk) {
        visualRisk.textContent =
            `${riskLabel(peakRisk)} — ${Math.round(peakRisk)}/100`;
    }

    if (summary) {
        summary.textContent =
            `${labels.length}-day projection: average energy demand ` +
            `${Math.round(averageEnergy).toLocaleString("en-IN")} kWh/day, ` +
            `${Math.round(totalFuelUsed).toLocaleString("en-IN")} L fuel used, ` +
            `${highRiskDays} high-risk days.`;
    }

    if (simulationEnergyChart) simulationEnergyChart.destroy();
    if (simulationFuelChart) simulationFuelChart.destroy();
    if (simulationRiskChart) simulationRiskChart.destroy();

    const energyCanvas = document.getElementById("simulationEnergyChart");
    const fuelCanvas = document.getElementById("simulationFuelChart");
    const riskCanvas = document.getElementById("simulationRiskChart");

    if (!energyCanvas || !fuelCanvas || !riskCanvas) return;

    const chartLabels = labels.map((date, index) =>
        index % Math.ceil(labels.length / 8) === 0
            ? date.slice(5)
            : ""
    );

    simulationEnergyChart = new Chart(energyCanvas, {
        type: "line",
        data: {
            labels: chartLabels,
            datasets: [{
                label: "kWh/day",
                data: energy,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });

    simulationFuelChart = new Chart(fuelCanvas, {
        type: "line",
        data: {
            labels: chartLabels,
            datasets: [{
                label: "Fuel L/day",
                data: fuel,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });

    simulationRiskChart = new Chart(riskCanvas, {
        type: "line",
        data: {
            labels: chartLabels,
            datasets: [{
                label: "Risk",
                data: risk,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100
                }
            }
        }
    });
}

const runSimulationButton =
    document.getElementById("runSimulation");

runSimulationButton?.addEventListener(
    "click",
    runDigitalTwinSimulation
);

["personnel", "dailyEnergy", "fuelStock", "waterStock", "foodStock", "medicalStock",
    "emergencySeverity", "transportAvailability", "temperatureSensitivity", "windSensitivity",
    "snowfallSensitivity", "stormSensitivity", "baselineRisk", "planningInfrastructureType",
    "planningCapacity", "projectLifetime", "expectedUtilization", "installationCost",
    "infrastructureEnergyRequirement"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
        if (document.getElementById("startDate")?.value && document.getElementById("endDate")?.value) {
            runDigitalTwinSimulation();
        }
    });
});

updateSimulationMode();
initializeSimulationDates();
updateSimulationBaseline();

initializeMap();
updateStationInformation();

setInterval(() => {
    if (!simulationRunning) {
        loadWeather();
    }
}, 300000);

let environmentLayer = null;
let environmentMarkers = [];

function clearEnvironmentEffect() {
    if (!map) {
        return;
    }

    if (environmentLayer) {
        map.removeLayer(environmentLayer);
        environmentLayer = null;
    }

    environmentMarkers.forEach(function (item) {
        map.removeLayer(item);
    });

    environmentMarkers = [];
}

function getCurrentStationPosition() {
    const station = document.getElementById("station");

    if (station && station.value === "bharati") {
        return [-69.4069, 76.1956];
    }

    return [-70.7644, 11.7342];
}

function createStationEffect(color, radius, opacity) {
    const position = getCurrentStationPosition();

    environmentLayer = L.circleMarker(position, {
        radius: radius,
        color: color,
        fillColor: color,
        fillOpacity: opacity,
        weight: 2
    }).addTo(map);
}

function createWindLines() {
    const position = getCurrentStationPosition();

    const offsets = [
        [0.025, -0.035, 0.025, 0.045],
        [-0.015, -0.045, -0.015, 0.035],
        [0.045, -0.020, 0.045, 0.050]
    ];

    offsets.forEach(function (line) {
        const polyline = L.polyline(
            [
                [
                    position[0] + line[0],
                    position[1] + line[1]
                ],
                [
                    position[0] + line[2],
                    position[1] + line[3]
                ]
            ],
            {
                color: "#4d7891",
                weight: 3,
                opacity: 0.75
            }
        ).addTo(map);

        environmentMarkers.push(polyline);
    });
}

function createSnowMarkers() {
    const position = getCurrentStationPosition();

    const offsets = [
        [0.015, 0.020],
        [-0.020, 0.030],
        [0.030, -0.025],
        [-0.030, -0.020],
        [0.010, -0.045],
        [-0.010, 0.050]
    ];

    offsets.forEach(function (offset) {
        const marker = L.circleMarker(
            [
                position[0] + offset[0],
                position[1] + offset[1]
            ],
            {
                radius: 4,
                color: "#ffffff",
                fillColor: "#ffffff",
                fillOpacity: 0.9,
                weight: 1
            }
        ).addTo(map);

        environmentMarkers.push(marker);
    });
}

function activateEnvironmentLayer(layer) {
    clearEnvironmentEffect();

    const description =
        document.getElementById("selectedLayerDescription");

    switch (layer) {

        case "temperature": {
            const tempElement =
                document.getElementById("liveTemperature");

            const temperature =
                parseFloat(
                    tempElement?.textContent || "-15"
                );

            const cold =
                Number.isNaN(temperature) || temperature <= -20;

            createStationEffect(
                cold ? "#4d9bd6" : "#e26d5c",
                32,
                0.28
            );

            if (description) {
                description.textContent =
                    `${temperature.toFixed(1)}°C — localized temperature condition at the station.`;
            }

            break;
        }

        case "wind": {
            const windElement =
                document.getElementById("liveWind");

            const wind =
                parseFloat(
                    windElement?.textContent || "20"
                );

            createStationEffect(
                "#5b8da6",
                28,
                0.12
            );

            createWindLines();

            if (description) {
                description.textContent =
                    `${wind.toFixed(1)} m/s — directional wind field around the station.`;
            }

            break;
        }

        case "snowfall": {

            createStationEffect(
                "#9ec6dc",
                30,
                0.16
            );

            createSnowMarkers();

            if (description) {
                description.textContent =
                    "Snowfall conditions localized around the station.";
            }

            break;
        }

        case "visibility": {

            createStationEffect(
                "#8999a4",
                34,
                0.20
            );

            if (description) {
                description.textContent =
                    "Reduced visibility zone localized around the station.";
            }

            break;
        }

        case "storm": {

            createStationEffect(
                "#d05b5b",
                38,
                0.25
            );

            if (description) {
                description.textContent =
                    "Storm risk detected — localized affected area around the station.";
            }

            break;
        }

        case "pressure": {

            createStationEffect(
                "#738fa3",
                30,
                0.14
            );

            if (description) {
                description.textContent =
                    "Atmospheric pressure condition at the station.";
            }

            break;
        }
    }
}

function setupEnvironmentEffects() {

    const panel =
        document.getElementById("environmentPanel");

    if (!panel) {
        return;
    }

    const buttons =
        panel.querySelectorAll("button");

    buttons.forEach(function (button) {

        const text =
            button.textContent
                .trim()
                .toLowerCase();

        let layer = null;

        if (text.includes("temperature")) {
            layer = "temperature";
        }

        if (text.includes("wind")) {
            layer = "wind";
        }

        if (text.includes("snow")) {
            layer = "snowfall";
        }

        if (text.includes("visibility")) {
            layer = "visibility";
        }

        if (text.includes("storm")) {
            layer = "storm";
        }

        if (text.includes("pressure")) {
            layer = "pressure";
        }

        if (!layer) {
            return;
        }

        button.addEventListener(
            "click",
            function () {
                activateEnvironmentLayer(layer);
            }
        );
    });
}



const infrastructureType =
    document.getElementById("infrastructureType");

const infrastructureCapacity =
    document.getElementById("infrastructureCapacity");

const infrastructureCapacityValue =
    document.getElementById("infrastructureCapacityValue");

const infrastructureUnit =
    document.getElementById("infrastructureUnit");

const addInfrastructure =
    document.getElementById("addInfrastructure");

const infrastructureList =
    document.getElementById("infrastructureList");

const infraCost =
    document.getElementById("infraCost");

const infraEnergy =
    document.getElementById("infraEnergy");

const infraFuelSaved =
    document.getElementById("infraFuelSaved");

const infraCO2 =
    document.getElementById("infraCO2");

function getInfrastructureWeatherValues() {
    const readValue = (value, elementId) => {
        const parsed = Number(value);

        if (Number.isFinite(parsed)) {
            return parsed;
        }

        const element = document.getElementById(elementId);
        const elementValue = Number(element?.textContent);

        return Number.isFinite(elementValue) ? elementValue : null;
    };

    return {
        temperature: readValue(latestWeather?.temperature, "liveTemperature"),
        wind: readValue(latestWeather?.wind_speed, "liveWind"),
        pressure: readValue(latestWeather?.pressure, "livePressure"),
        humidity: readValue(latestWeather?.humidity, "liveHumidity")
    };
}

function calculateInfrastructureHealth(item, weather = getInfrastructureWeatherValues(), simulation = latestSimulation) {
    const factors = [];
    const temp = weather.temperature;
    const wind = weather.wind;
    let score = 100;

    if (!Number.isFinite(temp) || !Number.isFinite(wind)) {
        return {
            healthScore: null,
            status: "UNAVAILABLE",
            mainRisk: "Weather data unavailable",
            riskFactors: [],
            recommendedAction: "Wait for the next station observation before assessing environmental risk.",
            temperatureStress: "Unavailable",
            windExposure: "Unavailable",
            resourceRisk: "Unavailable",
            currentConditions: "Weather data unavailable"
        };
    }

    const coldPenalty = temp < -40 ? 35 : temp < -30 ? 22 : temp < -20 ? 10 : 0;
    const windPenalty = wind > 25 ? 35 : wind > 20 ? 22 : wind > 15 ? 10 : 0;
    const temperatureStress = temp < -40 ? "Critical" : temp < -30 ? "High" : temp < -20 ? "Moderate" : "Low";
    const windExposure = wind > 25 ? "Critical" : wind > 20 ? "High" : wind > 15 ? "Elevated" : "Low";
    let resourceRisk = "Low";

    if (["solar", "wind", "diesel", "water"].includes(item.type)) {
        score -= coldPenalty;
        if (coldPenalty) factors.push(temp < -40 ? `Critical cold stress (${temp.toFixed(1)} °C)` : `Cold stress (${temp.toFixed(1)} °C)`);
    }

    if (["solar", "wind", "diesel"].includes(item.type)) {
        score -= windPenalty;
        if (windPenalty) factors.push(wind > 25 ? `Extreme wind exposure (${wind.toFixed(1)} m/s)` : `High wind exposure (${wind.toFixed(1)} m/s)`);
    }

    if (item.type === "solar" && (temp < -30 || wind > 20)) {
        score -= 8;
        factors.push("Reduced solar performance or snow/ice accumulation risk");
    }

    if (item.type === "wind" && wind > 25) {
        score -= 20;
        factors.push("Extreme wind shutdown risk");
    }

    if (item.type === "battery") {
        score -= coldPenalty + (temp < -30 ? 8 : 0);
        if (coldPenalty) factors.push(`Battery thermal stress (${temp.toFixed(1)} °C)`);
        if (simulation && Number.isFinite(simulation.averageEnergy) && simulation.averageEnergy > item.capacity * 0.8) {
            score -= 12;
            resourceRisk = "Elevated";
            factors.push("Modeled energy demand is high for installed battery capacity");
        }
    }

    if (item.type === "diesel" && simulation && Number(simulation.peakRisk) >= 70) {
        score -= 12;
        resourceRisk = "Elevated";
        factors.push("Simulation shows high operational risk and generator demand");
    }

    if (item.type === "fuel" && simulation) {
        const remaining = Number(simulation.fuelRemaining);
        const projected = Number(simulation.projectedFuelStock);
        if (Number.isFinite(remaining) && Number.isFinite(projected) && projected > 0 && remaining / projected < 0.25) {
            score -= 35;
            resourceRisk = "Critical";
            factors.push("Projected fuel reserve is low");
        } else if (simulation.resourceResupplyRequired) {
            score -= 25;
            resourceRisk = "Elevated";
            factors.push("Simulation projects a fuel resupply requirement");
        }
        if (temp < -30) {
            score -= 12;
            factors.push(`Extreme cold exposure (${temp.toFixed(1)} °C)`);
        }
    }

    if (item.type === "water" && simulation && Number.isFinite(simulation.waterRemaining) && simulation.waterRemaining <= 0) {
        score -= 35;
        resourceRisk = "Critical";
        factors.push("Modeled water availability is depleted");
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const status = score < 45 ? "CRITICAL" : score < 75 ? "WARNING" : "NORMAL";
    const recommendedAction = getInfrastructureRecommendation(item, factors, status);
    const mainRisk = item.type === "wind" && wind > 25
        ? `Extreme wind exposure (${wind.toFixed(1)} m/s)`
        : factors[0] || "Low assessed environmental risk";

    return {
        healthScore: score,
        status,
        mainRisk,
        riskFactors: factors,
        recommendedAction,
        temperatureStress,
        windExposure,
        resourceRisk,
        currentConditions: `Temperature: ${temp.toFixed(1)} °C | Wind: ${wind.toFixed(1)} m/s | Pressure: ${Number.isFinite(weather.pressure) ? weather.pressure.toFixed(0) : "--"} hPa`
    };
}

function getInfrastructureRecommendation(item, factors, status) {
    if (status === "NORMAL") {
        return "No immediate weather-based risk detected. Continue routine inspection.";
    }
    if (factors.some(factor => factor.includes("fuel reserve"))) {
        return "Schedule resupply and verify fuel storage availability.";
    }
    if (factors.some(factor => factor.includes("water availability"))) {
        return "Inspect water treatment operation and review remaining reserves.";
    }
    if (item.type === "solar" && factors.some(factor => factor.includes("snow/ice"))) {
        return "Inspect panel mounting and check for snow or ice accumulation before maintenance.";
    }
    if (item.type === "battery") {
        return "Check thermal protection and available storage capacity.";
    }
    if (item.type === "wind" && factors.some(factor => factor.includes("wind"))) {
        return "Inspect turbine and verify operating or shutdown limits.";
    }
    if (item.type === "diesel") {
        return "Inspect cold-start systems and verify generator readiness.";
    }
    if (factors.some(factor => factor.includes("wind"))) {
        return "Inspect external structures and verify wind-sensitive equipment operating limits.";
    }
    return "Check thermal protection, insulation and cold-weather readiness.";
}

function assessInfrastructureHealth() {
    const checkedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return stationInfrastructure.map(item => ({
        ...item,
        ...calculateInfrastructureHealth(item),
        station: currentStation,
        lastChecked: checkedAt,
        capacityLabel: `${Number(item.capacity).toLocaleString("en-IN")} ${item.unit}`
    }));
}

function infrastructureStatusClass(status) {
    return status.toLowerCase();
}

function renderInfrastructureHealthCards(assessments) {
    const container = document.getElementById("infrastructureHealthCards");
    if (!container) return;

    if (!assessments.length) {
        container.innerHTML = '<div class="empty-infrastructure">No infrastructure assets added to this station yet.</div>';
        return;
    }

    container.innerHTML = assessments.map(item => {
        const score = item.healthScore === null ? "--" : `${item.healthScore}%`;
        const risks = item.riskFactors.length ? item.riskFactors.join("; ") : "Low assessed risk";
        return `<article class="health-card ${infrastructureStatusClass(item.status)}" data-health-index="${assessments.indexOf(item)}" tabindex="0" role="button" aria-label="Inspect ${item.name} health">
            <div class="health-card-heading"><div><strong>${item.name}</strong><small>${item.capacityLabel}</small></div><span>${score}</span></div>
            <div class="health-card-status"><b>${item.status}</b><span>${item.status === "NORMAL" ? "Within assessed limits" : "Inspection recommended"}</span></div>
            <div class="health-card-factors"><span>Temperature Stress: ${item.temperatureStress}</span><span>Wind Exposure: ${item.windExposure}</span><span>Resource Risk: ${item.resourceRisk}</span></div>
            <p><b>Risk:</b> ${risks}</p>
            <p><b>Action:</b> ${item.recommendedAction}</p>
            <p class="health-card-conditions"><b>Conditions:</b> ${item.currentConditions}</p>
            <small>Last checked: ${item.lastChecked}</small>
        </article>`;
    }).join("");

    container.querySelectorAll(".health-card").forEach(card => {
        const selectAsset = () => updateSelectedInfrastructureHealth(assessments[Number(card.dataset.healthIndex)]);
        card.addEventListener("click", selectAsset);
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectAsset();
            }
        });
    });
}

function updateSelectedInfrastructureHealth(item) {
    const title = document.getElementById("visualInfrastructureSelected");
    const status = document.getElementById("visualInfrastructureSelectedStatus");
    const detail = document.getElementById("visualInfrastructureSelectedRisk");
    const action = document.getElementById("visualInfrastructureSelectedAction");
    if (!title || !status || !detail || !action) return;
    if (!item) {
        title.textContent = "No asset selected";
        status.textContent = "--";
        detail.textContent = "Select an installed asset to inspect its assessed risk.";
        action.textContent = "Recommended action will appear here.";
        return;
    }
    title.textContent = `${item.name} - ${item.healthScore === null ? "Unavailable" : `${item.healthScore}% ${item.status}`}`;
    status.textContent = item.status;
    status.className = infrastructureStatusClass(item.status);
    detail.textContent = `Risk: ${item.mainRisk}. Factors: ${item.riskFactors.join(" ") || "None currently assessed."} Conditions: ${item.currentConditions}`;
    action.textContent = `Action: ${item.recommendedAction}`;
}

function generateInfrastructureAlerts(assessments) {
    return assessments
        .filter(item => item.status === "CRITICAL" || item.status === "WARNING")
        .sort((a, b) => (a.status === "CRITICAL" ? 0 : 1) - (b.status === "CRITICAL" ? 0 : 1))
        .map(item => ({
            status: item.status,
            name: item.name,
            problem: item.mainRisk,
            cause: item.riskFactors.join(" ") || "Environmental stress detected.",
            action: item.recommendedAction
        }));
}

function updateInfrastructureHealthVisualization(assessments, summary, alerts) {
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    const weather = getInfrastructureWeatherValues();

    const highestRisk = assessments
        .filter(item => item.healthScore !== null)
        .sort((a, b) => a.healthScore - b.healthScore)[0];

    setText(
        "visualInfrastructureHealth",
        summary.score === null ? "--" : `${summary.score}%`
    );

    setText(
        "visualInfrastructureStatus",
        summary.status
    );

    setText(
        "visualInfrastructureAlerts",
        String(alerts.length)
    );

    setText(
        "visualInfrastructureHighestRisk",
        highestRisk?.name ||
        (summary.environmentalRisks?.length ? "Station Environment" : "None")
    );

    if (Number.isFinite(weather.temperature) && Number.isFinite(weather.wind)) {
        setText(
            "visualInfrastructureEnvironment",
            `Temperature: ${weather.temperature.toFixed(1)} °C | Wind: ${weather.wind.toFixed(1)} m/s | Pressure: ${
                Number.isFinite(weather.pressure)
                    ? weather.pressure.toFixed(0)
                    : "--"
            } hPa`
        );
    } else {
        setText(
            "visualInfrastructureEnvironment",
            "Weather data unavailable"
        );
    }

    const breakdown = document.getElementById(
        "visualInfrastructureBreakdown"
    );

    if (breakdown) {
        breakdown.innerHTML = assessments.length
            ? assessments.map((item, index) => `
                <div
                    class="visual-health-row ${infrastructureStatusClass(item.status)}"
                    data-health-index="${index}"
                >
                    <span>${item.name}</span>
                    <b class="${infrastructureStatusClass(item.status)}">
                        ${
                            item.healthScore === null
                                ? "--"
                                : `${item.healthScore}% ${item.status}`
                        }
                    </b>
                </div>
            `).join("")
            : `
                <div class="visual-health-row ${infrastructureStatusClass(summary.environmentalStatus)}">
                    <span>Station Environment</span>
                    <b class="${infrastructureStatusClass(summary.environmentalStatus)}">
                        ${
                            summary.environmentalScore === null
                                ? "--"
                                : `${summary.environmentalScore}% ${summary.environmentalStatus}`
                        }
                    </b>
                </div>
            `;
    }

    breakdown?.querySelectorAll(".visual-health-row").forEach(row => {
        row.addEventListener("click", () => {
            const index = Number(row.dataset.healthIndex);

            if (Number.isFinite(index) && assessments[index]) {
                updateSelectedInfrastructureHealth(assessments[index]);
            }
        });
    });

    if (highestRisk) {
        updateSelectedInfrastructureHealth(highestRisk);
    } else {
        const title = document.getElementById("visualInfrastructureSelected");
        const detail = document.getElementById("visualInfrastructureSelectedRisk");

        if (title) {
            title.textContent =
                summary.environmentalScore === null
                    ? "No environmental assessment"
                    : `Station Environment - ${summary.environmentalScore}% ${summary.environmentalStatus}`;
        }

        if (detail) {
            detail.textContent =
                summary.environmentalRisks?.length
                    ? summary.environmentalRisks.join(" ")
                    : "No immediate weather-based infrastructure risk detected.";
        }
    }
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

function getInfrastructure3DStatusColor(status) {
    if (status === "CRITICAL") return 0xb64f4f;
    if (status === "WARNING") return 0xc58a4a;
    return 0x4c8a70;
}

function getInfrastructure3DStatusName(score) {
    if (score < 45) return "CRITICAL";
    if (score < 75) return "WARNING";
    return "NORMAL";
}

function calculateStationStructureHealth(structure) {
    const assessment = calculateInfrastructureDamageSimulation(structure);
    return {
        ...assessment,
        status: getInfrastructure3DStatusName(assessment.healthScore),
        mainReason: assessment.mainReason,
        simulationActive: infrastructureDamageSimulation.active
    };
}

function calculateInfrastructureDamageSimulation(structure) {
    const weather = getInfrastructureWeatherValues();

    const temperature = Number.isFinite(weather.temperature)
        ? weather.temperature
        : -18;

    const wind = Number.isFinite(weather.wind)
        ? weather.wind
        : 8;

    const scenario =
        infrastructureDamageSimulation.scenario;

    const duration =
        infrastructureDamageSimulation.duration;

    let simulatedWind = wind;
    let simulatedTemperature = temperature;
    let snowfall = 20;
    let storm = 20;

    if (scenario === "storm") {
        simulatedWind += 15;
        snowfall = 75;
        storm = 90;
    }

    if (scenario === "blizzard") {
        simulatedWind += 10;
        simulatedTemperature -= 8;
        snowfall = 95;
        storm = 80;
    }

    if (scenario === "power") {
        storm = 35;
    }

    if (scenario === "fuel") {
        storm = 30;
    }

    if (scenario === "water") {
        snowfall = 45;
    }

    if (scenario === "combined") {
        simulatedWind += 18;
        simulatedTemperature -= 10;
        snowfall = 95;
        storm = 95;
    }

    let dailyDamage = 0;
    const risks = [];

    const windStress =
        Math.max(0, simulatedWind - 15) * 1.2;

    const coldStress =
        Math.max(0, -simulatedTemperature - 20) * 0.8;

    const snowStress =
        Math.max(0, snowfall - 40) * 0.45;

    const stormStress =
        Math.max(0, storm - 40) * 0.35;

    switch (structure.type) {

        case "habitat":

            dailyDamage += windStress * 0.45;
            dailyDamage += coldStress * 0.8;
            dailyDamage += snowStress * 0.55;

            if (scenario === "power") {
                dailyDamage += 18;
                risks.push("Heating and life-support power failure");
            }

            if (scenario === "blizzard") {
                dailyDamage += 8;
                risks.push("Snow accumulation around occupied areas");
            }

            if (windStress > 8) {
                risks.push("High wind loading on habitat envelope");
            }

            if (coldStress > 5) {
                risks.push("Extreme heating demand");
            }

            break;

        case "power":

            dailyDamage += windStress * 0.8;
            dailyDamage += coldStress * 0.7;
            dailyDamage += stormStress * 0.8;

            if (scenario === "power") {
                dailyDamage += 45;
                risks.push("Primary power system failure");
            }

            if (scenario === "combined") {
                dailyDamage += 25;
                risks.push("Grid failure during extreme weather");
            }

            if (windStress > 10) {
                risks.push("Wind exposure to external power equipment");
            }

            if (coldStress > 8) {
                risks.push("Cold stress on generation equipment");
            }

            break;

        case "fuel":

            dailyDamage += windStress * 0.35;
            dailyDamage += snowStress * 0.9;

            if (scenario === "fuel") {
                dailyDamage += 55;
                risks.push("Fuel reserve shortage");
            }

            if (scenario === "combined") {
                dailyDamage += 30;
                risks.push("Fuel supply disruption during storm");
            }

            if (snowfall > 60) {
                risks.push("Snow accumulation around fuel handling area");
            }

            break;

        case "water":

            dailyDamage += coldStress * 1.1;
            dailyDamage += snowStress * 0.35;

            if (scenario === "water") {
                dailyDamage += 60;
                risks.push("Water treatment system failure");
            }

            if (scenario === "power") {
                dailyDamage += 20;
                risks.push("Water treatment affected by power loss");
            }

            if (simulatedTemperature < -25) {
                risks.push("Cold stress on water infrastructure");
            }

            break;

        case "communications":

            dailyDamage += windStress * 1.25;
            dailyDamage += stormStress * 0.9;

            if (scenario === "storm") {
                dailyDamage += 15;
                risks.push("Communication mast exposed to severe winds");
            }

            if (scenario === "combined") {
                dailyDamage += 25;
                risks.push("Communications degraded during extreme storm");
            }

            if (simulatedWind > 25) {
                risks.push("High wind loading on antenna structure");
            }

            break;

        case "warehouse":

            dailyDamage += windStress * 0.65;
            dailyDamage += snowStress * 1.1;
            dailyDamage += stormStress * 0.45;

            if (scenario === "blizzard") {
                dailyDamage += 18;
                risks.push("Heavy snow loading on storage facility");
            }

            if (scenario === "combined") {
                dailyDamage += 15;
                risks.push("Cargo access disrupted by extreme weather");
            }

            if (snowfall > 60) {
                risks.push("Snow accumulation blocking access");
            }

            break;
    }

    if (scenario === "weather") {
        risks.unshift("Current station weather stress");
    }

    if (latestSimulation) {
        if (
            structure.type === "power" &&
            latestSimulation.averageEnergy > 1400
        ) {
            dailyDamage += 5;
            risks.push("High modeled energy demand");
        }

        if (
            structure.type === "fuel" &&
            latestSimulation.resourceResupplyRequired
        ) {
            dailyDamage += 8;
            risks.push("Simulation indicates resupply requirement");
        }

        if (
            structure.type === "water" &&
            latestSimulation.waterRemaining <= 0
        ) {
            dailyDamage += 12;
            risks.push("Modeled water reserve depleted");
        }
    }

    const totalDamage = Math.min(
        100,
        Math.round(
            dailyDamage *
            Math.sqrt(Math.max(1, duration / 24))
        )
    );

    const remainingHealth =
        Math.max(0, 100 - totalDamage);

    let recommendedAction = "Continue routine inspection and monitor station conditions.";
    if (structure.type === "habitat") {
        recommendedAction = "Inspect habitat envelope, heating backup and snow clearance around occupied areas.";
    } else if (structure.type === "power") {
        recommendedAction = "Inspect generator and isolate damaged power equipment before restart.";
    } else if (structure.type === "fuel") {
        recommendedAction = "Verify fuel storage readiness, access routes and resupply availability.";
    } else if (structure.type === "water") {
        recommendedAction = "Inspect water treatment operation, freeze protection and remaining reserves.";
    } else if (structure.type === "communications") {
        recommendedAction = "Inspect antenna supports and verify communications redundancy.";
    } else if (structure.type === "warehouse") {
        recommendedAction = "Inspect roof snow loading and keep cargo access routes clear.";
    }

    return {
        damage: totalDamage,
        healthScore: remainingHealth,
        risks,
        mainReason: risks[0] || "No immediate structure-specific stress detected",
        recommendedAction,
        scenario,
        duration,
        simulatedConditions: {
            temperature: simulatedTemperature,
            wind: simulatedWind,
            snowfall,
            storm
        }
    };
}

function makeInfrastructure3DBuilding(definition, assessment) {
    const group = new THREE.Group();

    const status = assessment?.status || "NORMAL";

    const colors = {
        NORMAL: {
            body: 0x607d8b,
            roof: 0x263746,
            trim: 0x8fa6b3,
            window: 0x38bdf8,
            light: 0x22c55e
        },
        WARNING: {
            body: 0x8a7650,
            roof: 0x4a4030,
            trim: 0xc7a75b,
            window: 0xfacc15,
            light: 0xf59e0b
        },
        CRITICAL: {
            body: 0x7f3f3f,
            roof: 0x3d2020,
            trim: 0xc45b5b,
            window: 0xff9b9b,
            light: 0xef4444
        }
    };

    const palette = colors[status] || colors.NORMAL;

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
        emissiveIntensity: 0.35,
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

    if (assessment?.damage > 0) {
        body.scale.y = Math.max(0.9, 1 - assessment.damage * 0.0015);
    }

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
    door.castShadow = true;

    group.add(door);

    const windowCount = Math.max(2, Math.floor(width / 2));

    for (let i = 0; i < windowCount; i++) {
        const x =
            -width / 2 +
            (i + 1) * (width / (windowCount + 1));

        const window = new THREE.Mesh(
            new THREE.BoxGeometry(0.75, 0.55, 0.08),
            windowMaterial
        );

        window.position.set(
            x,
            height * 0.58,
            depth / 2 + 0.07
        );

        group.add(window);
    }

    const sideWindow = new THREE.Mesh(
        new THREE.BoxGeometry(
            Math.min(2.2, width * 0.42),
            0.55,
            0.08
        ),
        windowMaterial
    );

    sideWindow.rotation.y = Math.PI / 2;

    sideWindow.position.set(
        width / 2 + 0.07,
        height * 0.58,
        0
    );

    group.add(sideWindow);

    const statusLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 16, 16),
        new THREE.MeshStandardMaterial({
            color: palette.light,
            emissive: palette.light,
            emissiveIntensity: 2
        })
    );

    statusLight.position.set(
        width / 2 - 0.35,
        height + 1.55,
        depth / 2 - 0.35
    );

    group.add(statusLight);

    const statusRing = new THREE.Mesh(
        new THREE.TorusGeometry(
            Math.max(width, depth) * 0.18,
            0.045,
            8,
            32
        ),
        new THREE.MeshBasicMaterial({
            color: palette.light,
            transparent: true,
            opacity: 0.75
        })
    );

    statusRing.rotation.x = Math.PI / 2;
    statusRing.position.y = 0.12;

    group.add(statusRing);

    const supportPositions = [
        [-width / 2 + 0.45, -depth / 2 + 0.45],
        [width / 2 - 0.45, -depth / 2 + 0.45],
        [-width / 2 + 0.45, depth / 2 - 0.45],
        [width / 2 - 0.45, depth / 2 - 0.45]
    ];

    supportPositions.forEach(([x, z]) => {
        const support = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8),
            trimMaterial
        );

        support.position.set(x, 0.4, z);
        support.castShadow = true;

        group.add(support);
    });

    if (
        definition.type === "Communications" ||
        definition.name.toLowerCase().includes("communication")
    ) {
        const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.1, 3.5, 10),
            trimMaterial
        );

        mast.position.y = height + 2.8;

        group.add(mast);

        for (let i = 0; i < 3; i++) {
            const antenna = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8),
                trimMaterial
            );

            antenna.rotation.z = Math.PI / 2;

            antenna.position.set(
                0,
                height + 2.2 + i * 0.55,
                0
            );

            group.add(antenna);
        }
    }

    if (
        definition.type === "Fuel" ||
        definition.name.toLowerCase().includes("fuel")
    ) {
        for (let i = -1; i <= 1; i++) {
            const tank = new THREE.Mesh(
                new THREE.CylinderGeometry(0.55, 0.55, 2.2, 24),
                new THREE.MeshStandardMaterial({
                    color: 0x64748b,
                    roughness: 0.4,
                    metalness: 0.55
                })
            );

            tank.rotation.z = Math.PI / 2;
            tank.position.set(
                i * 1.2,
                1.25,
                depth / 2 + 1.0
            );

            tank.castShadow = true;

            group.add(tank);
        }
    }

    if (
        definition.type === "Power" ||
        definition.name.toLowerCase().includes("power")
    ) {
        for (let i = -1; i <= 1; i++) {
            const pipe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, width * 0.7, 10),
                trimMaterial
            );

            pipe.rotation.z = Math.PI / 2;

            pipe.position.set(
                0,
                1.15 + i * 0.28,
                -depth / 2 - 0.12
            );

            group.add(pipe);
        }
    }

    group.position.set(
        definition.position[0],
        0,
        definition.position[2]
    );

    group.userData = {
        id: definition.id,
        name: definition.name,
        type: definition.type,
        assessment
    };

    infrastructure3DObjects.push(group);

    return group;
}

function createInfrastructure3DGround() {
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

    infrastructure3DScene.add(ground);

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

    infrastructure3DScene.add(snow);

    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.9
    });

    const road1 = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.08, 28),
        roadMaterial
    );

    road1.position.set(0, 0.08, 0);

    infrastructure3DScene.add(road1);

    const road2 = new THREE.Mesh(
        new THREE.BoxGeometry(28, 0.08, 2.2),
        roadMaterial
    );

    road2.position.set(0, 0.09, 0);

    infrastructure3DScene.add(road2);

    for (let i = 0; i < 18; i++) {
        const snowBank = new THREE.Mesh(
            new THREE.SphereGeometry(
                0.5 + Math.random() * 0.7,
                12,
                8
            ),
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

        infrastructure3DScene.add(snowBank);
    }
}

function initializeInfrastructure3D() {
    if (infrastructure3DInitialized) {
        updateInfrastructure3D();
        return;
    }

    const container = document.getElementById("infrastructure3D");

    if (!container || typeof THREE === "undefined") {
        console.error("Three.js infrastructure model could not initialize.");
        return;
    }

    infrastructure3DScene = new THREE.Scene();
    infrastructure3DScene.background = new THREE.Color(0xc4d4da);

    infrastructure3DCamera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / Math.max(1, container.clientHeight),
        0.1,
        200
    );

    infrastructure3DCamera.position.set(22, 20, 25);

    infrastructure3DRenderer = new THREE.WebGLRenderer({
        antialias: true
    });

    infrastructure3DRenderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.75)
    );

    infrastructure3DRenderer.setSize(
        container.clientWidth,
        container.clientHeight
    );

    infrastructure3DRenderer.shadowMap.enabled = true;

    container.appendChild(infrastructure3DRenderer.domElement);

    infrastructure3DControls = new THREE.OrbitControls(
        infrastructure3DCamera,
        infrastructure3DRenderer.domElement
    );

    infrastructure3DControls.enableDamping = true;
    infrastructure3DControls.dampingFactor = 0.06;
    infrastructure3DControls.target.set(0, 0, 0);
    infrastructure3DControls.minDistance = 12;
    infrastructure3DControls.maxDistance = 55;
    infrastructure3DControls.maxPolarAngle = Math.PI / 2.05;

    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    infrastructure3DScene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(15, 25, 12);
    keyLight.castShadow = true;
    infrastructure3DScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdbeaf0, 0.7);
    fillLight.position.set(-20, 12, -10);
    infrastructure3DScene.add(fillLight);

    createInfrastructure3DGround();

    infrastructure3DRaycaster = new THREE.Raycaster();
    infrastructure3DMouse = new THREE.Vector2();

    infrastructure3DRenderer.domElement.addEventListener(
        "pointermove",
        handleInfrastructure3DPointerMove
    );

    infrastructure3DRenderer.domElement.addEventListener(
        "click",
        handleInfrastructure3DClick
    );

    window.addEventListener(
        "resize",
        resizeInfrastructure3D
    );

    infrastructure3DInitialized = true;

    updateInfrastructure3D();

    infrastructure3DRenderLoop();
}

function updateInfrastructure3D() {
    if (!infrastructure3DScene || !infrastructure3DGroup) {
        if (infrastructure3DInitialized) {
            rebuildInfrastructure3D();
        }

        return;
    }

    rebuildInfrastructure3D();
}

function rebuildInfrastructure3D() {
    if (!infrastructure3DScene) return;

    if (infrastructure3DGroup) {
        infrastructure3DScene.remove(infrastructure3DGroup);
    }

    infrastructure3DGroup = new THREE.Group();
    infrastructure3DObjects = [];

    station3DStructures.forEach(definition => {
        const assessment = calculateStationStructureHealth(definition);

        const building = makeInfrastructure3DBuilding(
            definition,
            assessment
        );

        infrastructure3DGroup.add(building);
    });

    stationInfrastructure.forEach((item, index) => {
        const assessment = calculateInfrastructureHealth(item);

        const positionMap = {
            solar: [-4, 0, 7],
            wind: [3, 0, 7],
            battery: [-1, 0, 7],
            diesel: [5, 0, -5],
            fuel: [8, 0, -5],
            water: [-1, 0, -6]
        };

        const position =
            positionMap[item.type] ||
            [0, 0, 8];

        const definition = {
            id: `installed-${index}`,
            name: item.name,
            type: item.type,
            position,
            size:
                item.type === "solar"
                    ? [4.5, 0.35, 2.5]
                    : item.type === "wind"
                        ? [2, 1, 2]
                        : [3, 2, 2.5]
        };

        const building = makeInfrastructure3DBuilding(
            definition,
            assessment
        );

        if (item.type === "solar") {
            building.rotation.x = -0.15;
        }

        infrastructure3DGroup.add(building);
    });

    infrastructure3DScene.add(infrastructure3DGroup);

    updateInfrastructure3DOverlay();
}

function updateInfrastructure3DOverlay() {
    const title = document.querySelector(".infra3d-title strong");

    if (title) {
        title.textContent =
            `${stations[currentStation]?.name || "Station"} Digital Twin`;
    }
}

function getInfrastructure3DNode(object) {
    let node = object;

    while (node) {
        if (node.userData?.assessment && node.userData?.name) {
            return node;
        }

        node = node.parent;
    }

    return null;
}

function handleInfrastructure3DPointerMove(event) {
    if (!infrastructure3DRenderer || !infrastructure3DRaycaster) {
        return;
    }

    const rect =
        infrastructure3DRenderer.domElement.getBoundingClientRect();

    infrastructure3DMouse.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

    infrastructure3DMouse.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

    infrastructure3DRaycaster.setFromCamera(
        infrastructure3DMouse,
        infrastructure3DCamera
    );

    const intersections =
        infrastructure3DRaycaster.intersectObjects(
            infrastructure3DObjects,
            true
        );

    const tooltip =
        document.getElementById("infra3d-tooltip");

    if (!intersections.length) {
        infrastructure3DHovered = null;

        if (tooltip) {
            tooltip.style.display = "none";
        }

        infrastructure3DRenderer.domElement.style.cursor = "default";
        return;
    }

    const node =
        getInfrastructure3DNode(intersections[0].object);

    if (!node) {
        infrastructure3DHovered = null;

        if (tooltip) {
            tooltip.style.display = "none";
        }

        infrastructure3DRenderer.domElement.style.cursor = "default";
        return;
    }

    const data = node.userData;

    infrastructure3DHovered = node;

    infrastructure3DRenderer.domElement.style.cursor = "pointer";

    if (tooltip && data?.assessment) {
        tooltip.innerHTML =
            `<strong>${data.name}</strong>` +
            `<span>${data.assessment.healthScore ?? "--"}% health · ${data.assessment.damage ?? 0}% damage · ${data.assessment.status}</span>` +
            `<span>${data.assessment.mainReason}</span>`;

        tooltip.style.display = "block";
        tooltip.style.left =
            `${event.clientX - rect.left + 12}px`;
        tooltip.style.top =
            `${event.clientY - rect.top + 12}px`;
    }
}

function handleInfrastructure3DClick(event) {
    if (!infrastructure3DRenderer || !infrastructure3DRaycaster) {
        return;
    }

    const rect =
        infrastructure3DRenderer.domElement.getBoundingClientRect();

    infrastructure3DMouse.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

    infrastructure3DMouse.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

    infrastructure3DRaycaster.setFromCamera(
        infrastructure3DMouse,
        infrastructure3DCamera
    );

    const intersections =
        infrastructure3DRaycaster.intersectObjects(
            infrastructure3DObjects,
            true
        );

    if (!intersections.length) {
        return;
    }

    const node =
        getInfrastructure3DNode(intersections[0].object);

    if (!node) {
        return;
    }

    infrastructure3DHovered = node;

    const data = node.userData;
    const assessment = data.assessment;

    const title =
        document.getElementById("visualInfrastructureSelected");

    const detail =
        document.getElementById("visualInfrastructureSelectedRisk");

    const selectedStatus =
        document.getElementById("visualInfrastructureSelectedStatus");

    const selectedAction =
        document.getElementById("visualInfrastructureSelectedAction");

    if (title) {
        title.textContent =
            `${data.name} - ${assessment.healthScore ?? "--"}% health / ${assessment.damage ?? 0}% damage`;
    }

    if (selectedStatus) {
        selectedStatus.textContent = assessment.status;
        selectedStatus.className = assessment.status.toLowerCase();
    }

    if (detail) {
        detail.textContent =
            `${assessment.status}. Main reason: ${assessment.mainReason}. ` +
            `Risks: ${assessment.risks?.join(" ") || "None currently assessed."} ` +
            `Simulated conditions: ${assessment.simulatedConditions.temperature.toFixed(1)} °C, ` +
            `${assessment.simulatedConditions.wind.toFixed(1)} m/s wind, ` +
            `${assessment.simulatedConditions.snowfall.toFixed(0)} snow index.`;
    }

    if (selectedAction) {
        selectedAction.textContent = `Recommended action: ${assessment.recommendedAction}`;
    }

    const highestRisk =
        document.getElementById("visualInfrastructureHighestRisk");

    if (highestRisk) {
        highestRisk.textContent = data.name;
    }

    node.traverse(child => {
        if (child.material?.emissive) {
            child.material.emissiveIntensity = 0.8;
        }
    });

    setTimeout(() => {
        node.traverse(child => {
            if (child.material?.emissive) {
                child.material.emissiveIntensity = 0.35;
            }
        });
    }, 500);
}

function resizeInfrastructure3D() {
    const container =
        document.getElementById("infrastructure3D");

    if (
        !container ||
        !infrastructure3DRenderer ||
        !infrastructure3DCamera
    ) {
        return;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    infrastructure3DCamera.aspect =
        width / height;

    infrastructure3DCamera.updateProjectionMatrix();

    infrastructure3DRenderer.setSize(
        width,
        height
    );
}

function infrastructure3DRenderLoop() {
    if (!infrastructure3DRenderer) return;

    requestAnimationFrame(
        infrastructure3DRenderLoop
    );

    infrastructure3DControls?.update();

    infrastructure3DRenderer.render(
        infrastructure3DScene,
        infrastructure3DCamera
    );
}

function setInfrastructure3DVisible(visible) {
    const mapArea =
        document.querySelector(".map-area");

    if (!mapArea) return;

    mapArea.classList.toggle(
        "infrastructure-3d-active",
        visible
    );

    if (visible) {
        initializeInfrastructure3D();

        setTimeout(() => {
            resizeInfrastructure3D();
            updateInfrastructure3D();
        }, 100);
    }
}

function runInfrastructureDamageSimulation() {
    infrastructureDamageSimulation.active = true;
    infrastructureDamageSimulation.scenario = document.getElementById("infrastructureStressScenario")?.value || "weather";
    infrastructureDamageSimulation.duration = Number(document.getElementById("infrastructureStressDuration")?.value || 24);
    const status = document.getElementById("infrastructureStressStatus");
    if (status) status.textContent = "Damage simulation active - click a structure to inspect its stress assessment.";
    updateInfrastructure3D();
}

function resetInfrastructureDamageSimulation() {
    infrastructureDamageSimulation = {
        active: false,
        scenario: "weather",
        duration: 24,
        results: {}
    };
    const status = document.getElementById("infrastructureStressStatus");
    if (status) status.textContent = "Current weather assessment";
    updateInfrastructure3D();
}

document.getElementById("runInfrastructureStressTest")?.addEventListener("click", runInfrastructureDamageSimulation);
document.getElementById("resetInfrastructureStressTest")?.addEventListener("click", resetInfrastructureDamageSimulation);

function updateInfrastructureHealthMonitor() {
    const assessments = assessInfrastructureHealth();
    const weather = getInfrastructureWeatherValues();

    let environmentalScore = null;
    let environmentalStatus = "UNAVAILABLE";
    const environmentalRisks = [];

    if (Number.isFinite(weather.temperature) && Number.isFinite(weather.wind)) {
        environmentalScore = 100;

        if (weather.temperature < -40) {
            environmentalScore -= 35;
            environmentalRisks.push(`Critical cold stress (${weather.temperature.toFixed(1)} °C)`);
        } else if (weather.temperature < -30) {
            environmentalScore -= 22;
            environmentalRisks.push(`Cold stress (${weather.temperature.toFixed(1)} °C)`);
        } else if (weather.temperature < -20) {
            environmentalScore -= 10;
            environmentalRisks.push(`Cold stress (${weather.temperature.toFixed(1)} °C)`);
        }

        if (weather.wind > 25) {
            environmentalScore -= 35;
            environmentalRisks.push(`Extreme wind exposure (${weather.wind.toFixed(1)} m/s)`);
        } else if (weather.wind > 20) {
            environmentalScore -= 22;
            environmentalRisks.push(`High wind exposure (${weather.wind.toFixed(1)} m/s)`);
        } else if (weather.wind > 15) {
            environmentalScore -= 10;
            environmentalRisks.push(`Elevated wind exposure (${weather.wind.toFixed(1)} m/s)`);
        }

        environmentalScore = Math.max(0, Math.min(100, Math.round(environmentalScore)));

        environmentalStatus =
            environmentalScore < 45
                ? "CRITICAL"
                : environmentalScore < 75
                    ? "WARNING"
                    : "NORMAL";
    }

    const availableAssets = assessments.filter(item => item.healthScore !== null);

    const assetScore = availableAssets.length
        ? Math.round(
            availableAssets.reduce((sum, item) => sum + item.healthScore, 0) /
            availableAssets.length
        )
        : null;

    const critical = assessments.filter(item => item.status === "CRITICAL").length;
    const warning = assessments.filter(item => item.status === "WARNING").length;
    const healthy = assessments.filter(item => item.status === "NORMAL").length;

    const overallScore = assetScore !== null
        ? Math.round((assetScore + (environmentalScore ?? assetScore)) / 2)
        : environmentalScore;

    const overallStatus =
        critical > 0 || environmentalStatus === "CRITICAL"
            ? "CRITICAL"
            : warning > 0 || environmentalStatus === "WARNING"
                ? "WARNING"
                : overallScore !== null
                    ? "NORMAL"
                    : "UNAVAILABLE";

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText(
        "infrastructureHealthStation",
        stations[currentStation]?.code || currentStation.toUpperCase()
    );

    setText(
        "infrastructureHealthScore",
        overallScore === null ? "--" : `${overallScore}%`
    );

    setText("infrastructureHealthStatus", overallStatus);
    setText("infrastructureHealthyCount", String(healthy));
    setText("infrastructureWarningCount", String(warning));
    setText("infrastructureCriticalCount", String(critical));

    setText(
        "infrastructureHealthChecked",
        new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        })
    );

    let alertText;

    if (environmentalRisks.length) {
        alertText = environmentalRisks.join(" ");
    } else if (assessments.length) {
        alertText = "All monitored infrastructure systems are operating within assessed environmental limits.";
    } else {
        alertText = "No infrastructure assets installed. Station environment is being monitored.";
    }

    setText("infrastructureHealthAlerts", alertText);

    const statusElement = document.getElementById("infrastructureHealthStatus");

    if (statusElement) {
        statusElement.className =
            `health-summary-status ${infrastructureStatusClass(overallStatus)}`;
    }

    const alertElement = document.getElementById("infrastructureHealthAlerts");

    if (alertElement) {
        alertElement.className =
            `health-alerts ${
                overallStatus === "CRITICAL"
                    ? "critical"
                    : overallStatus === "WARNING"
                        ? "warning"
                        : "normal"
            }`;
    }

    renderInfrastructureHealthCards(assessments);

    updateInfrastructureHealthVisualization(
        assessments,
        {
            score: overallScore,
            status: overallStatus,
            environmentalScore,
            environmentalStatus,
            environmentalRisks
        },
        environmentalRisks
    );
    updateInfrastructure3D();
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

    let totalCost = 0;
    let totalEnergy = 0;
    let totalFuel = 0;
    let totalCO2 = 0;

    stationInfrastructure.forEach(function (item) {

        totalCost += item.cost;
        totalEnergy += item.energy;
        totalFuel += item.fuel;
        totalCO2 += item.co2;

    });

    infraCost.textContent =
        "₹" +
        Math.round(totalCost)
            .toLocaleString("en-IN");

    infraEnergy.textContent =
        totalEnergy.toFixed(1) +
        " kWh/day";

    infraFuelSaved.textContent =
        totalFuel.toFixed(1) +
        " L/day";

    infraCO2.textContent =
        totalCO2.toFixed(1) +
        " kg/day";

    const visualCost = document.getElementById("visualInfraCost");
    const visualEnergy = document.getElementById("visualInfraEnergy");
    const visualFuel = document.getElementById("visualInfraFuel");
    const visualCO2 = document.getElementById("visualInfraCO2");

    if (visualCost) visualCost.textContent = infraCost.textContent;
    if (visualEnergy) visualEnergy.textContent = infraEnergy.textContent;
    if (visualFuel) visualFuel.textContent = infraFuelSaved.textContent;
    if (visualCO2) visualCO2.textContent = infraCO2.textContent;

    const visualSummary = document.getElementById("visualInfraSummary");
    if (visualSummary) {
        const lifetime = document.getElementById("projectLifetime")?.value || 20;
        visualSummary.textContent =
            `${Math.round(totalEnergy).toLocaleString("en-IN")} kWh/day modeled generation and ` +
            `${Math.round(totalFuel).toLocaleString("en-IN")} L/day modeled fuel effect over a ` +
            `${lifetime}-year project life.`;
    }
}

function renderInfrastructure() {

    if (stationInfrastructure.length === 0) {

        infrastructureList.innerHTML =
            `<div class="empty-infrastructure">
                No additional infrastructure added.
            </div>`;

        calculateInfrastructureImpact();

        return;
    }

    infrastructureList.innerHTML =
        stationInfrastructure.map(function (item, index) {

            return `
                <div class="infrastructure-item">

                    <strong>
                        ${item.name}
                    </strong>

                    <span>
                        Capacity:
                        ${item.capacity.toLocaleString("en-IN")}
                        ${item.unit}
                    </span>

                    <span>
                        Investment:
                        ₹${Math.round(item.cost)
                            .toLocaleString("en-IN")}
                    </span>

                    ${
                        item.energy > 0
                        ? `<span>
                            Energy:
                            ${item.energy.toFixed(1)} kWh/day
                           </span>`
                        : ""
                    }

                    ${
                        item.fuel > 0
                        ? `<span>
                            Fuel saved:
                            ${item.fuel.toFixed(1)} L/day
                           </span>`
                        : ""
                    }

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
                    updateInfrastructureHealthMonitor();
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
        updateInfrastructureHealthMonitor();
        updateLogistics();

    }
);

updateInfrastructureControls();
loadStationInfrastructure();
renderInfrastructure();
document.getElementById("refreshInfrastructureHealth")?.addEventListener("click", updateInfrastructureHealthMonitor);

function updateLogistics() {
    const temperature =
        parseFloat(document.getElementById("liveTemperature")?.textContent);

    const wind =
        parseFloat(document.getElementById("liveWind")?.textContent);

    const resourceType =
        document.getElementById("resourceType")?.value || "fuel";

    const resources = {
        fuel: {
            stock: Number(document.getElementById("fuelStock")?.value || 10000),
            unit: "L",
            daily: latestSimulation?.dailyFuelUse || 0
        },

        food: {
            stock: Number(document.getElementById("foodStock")?.value || 3000),
            unit: "kg",
            daily: Number(document.getElementById("personnel")?.value || 45) * 2.2
        },

        water: {
            stock: Number(document.getElementById("waterStock")?.value || 6000),
            unit: "L",
            daily: 150
        },

        medical: {
            stock: Number(document.getElementById("medicalStock")?.value || 500),
            unit: "units",
            daily: Number(document.getElementById("personnel")?.value || 45) * 0.02
        }
    };

    const resource = resources[resourceType];

    if (resourceType === "fuel" && latestSimulation) {
        resource.stock = latestSimulation.projectedFuelStock;
        resource.daily = latestSimulation.dailyFuelUse;
    }

    const infrastructure = getInfrastructureSimulationImpact();
    if (resourceType === "water") {
        resource.stock += infrastructure.waterCapacity;
        resource.daily = Math.max(1, resource.daily - infrastructure.waterCapacity * 0.01);
    }

    const currentWind =
        Number.isFinite(wind) ? wind : 8;

    const currentTemperature =
        Number.isFinite(temperature) ? temperature : -18;

    let transport = latestSimulation
        ? latestSimulation.minimumTransport
        : 100;

    if (!latestSimulation) {
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
    }

    transport = Math.max(
        0,
        Math.min(100, transport)
    );

    const daysRemaining =
        resource.daily > 0
            ? resource.stock / resource.daily
            : 0;

    const startDate =
        document.getElementById("startDate")?.value;

    const endDate =
        document.getElementById("endDate")?.value;

    let simulationDays = 30;

    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        simulationDays =
            Math.max(
                1,
                Math.ceil(
                    (end - start) /
                    (1000 * 60 * 60 * 24)
                ) + 1
            );
    }

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

    let depletionDate = "--";

    if (startDate) {
        const date = new Date(startDate);

        date.setDate(
            date.getDate() +
            Math.floor(daysRemaining)
        );

        depletionDate =
            date.toISOString().split("T")[0];
    }

    document.getElementById("resourceDepletion").textContent =
        depletionDate;

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
            `will be depleted before the ${simulationDays}-day simulation ends.`;
    } else {
        resupplyStatus.textContent =
            "Resupply Not Required";

        resupplyMessage.textContent =
            `Current ${resourceType} stock is sufficient for the ` +
            `${simulationDays}-day simulation period.`;
    }

    document.getElementById("visualLogisticsStatus").textContent =
        requiredResupply ? "RESUPPLY REQUIRED" : "STOCK SUFFICIENT";
    document.getElementById("visualLogisticsDepletion").textContent = depletionDate;
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
        clearEnvironmentEffect();
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

["snow", "visibility", "storm", "wind", "startDate", "endDate"].forEach(id => {
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
            conditions: { temperature: null, wind: null, direction: null, pressure: null, snow: null, visibility: null },
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
            direction: null,
            pressure,
            snow: null,
            visibility: null,
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
    if (!map || !document.getElementById("environmentPanel") || document.getElementById("environmentPanel").classList.contains("hidden")) return;
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
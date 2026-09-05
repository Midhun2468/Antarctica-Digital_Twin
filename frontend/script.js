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
let weatherArea;
let weatherChart;
let simulationRunning = false;

let latestSimulation = null;
let latestWeather = null;

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

const stationSelect = document.getElementById("station");

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

    liveTemperature.textContent = "--";
    liveWind.textContent = "--";
    livePressure.textContent = "--";
    liveHumidity.textContent = "--";
    weatherTimestamp.textContent = "Loading...";

    if (mapDataStatus) {
        mapDataStatus.textContent = "Connecting to weather data";
    }

    try {
        const response = await fetch(
            `/api/weather/${currentStation}`,
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

        updateLogistics();
        const activeLayer = document.querySelector(".layer-button.active")?.dataset.layer;
        if (activeLayer && document.getElementById("environmentPanel")?.classList.contains("panel-content") &&
            !document.getElementById("environmentPanel")?.classList.contains("hidden")) {
            applyMapLayer(activeLayer === "snow" ? "snowfall" : activeLayer);
        }

    } catch (error) {
        latestWeather = null;
        clearOpenMeteoForecastLayer();
        updateWeatherVisualization(null);
        updateWeatherChart(null);
        updateSimulationBaseline();
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
    currentStation = stationSelect.value;
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
        const response = await fetch("/api/config", { headers: { "Accept": "application/json" } });
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
                openEnvironmentMap();
            } else {
                clearEnvironmentEffect();
                setEnvironmentMapVisible(false);
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

let stationInfrastructure = [];

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

                    renderInfrastructure();
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

        renderInfrastructure();
        updateLogistics();

    }
);

updateInfrastructureControls();
renderInfrastructure();

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



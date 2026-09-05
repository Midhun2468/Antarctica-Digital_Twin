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
let weatherArea;
let weatherChart;
let simulationRunning = false;

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
    const data = stations[currentStation];

    map = L.map("map", {
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

    if (weatherArea) {
        weatherArea.remove();
    }

    weatherArea = L.circle(
        [data.lat, data.lon],
        {
            radius: 180000,
            color: "#4c819c",
            weight: 1,
            fillColor: "#6f9fb2",
            fillOpacity: 0.08
        }
    ).addTo(map);
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
            mapDataStatus.textContent = "Live weather connected";
        }

        if (weather.hourly) {
            updateWeatherChart(weather.hourly);
        }

    } catch (error) {
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

function updateWeatherChart(hourly) {
    if (!hourly || !hourly.time) {
        return;
    }

    const labels = hourly.time.slice(0, 24).map(value => {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
    });

    const temperatureData =
        (hourly.temperature || [])
            .slice(0, 24)
            .map(Number);

    const windData =
        (hourly.wind_speed || [])
            .slice(0, 24)
            .map(Number);

    const canvas = document.getElementById("weatherChart");

    if (!canvas) {
        return;
    }

    if (weatherChart) {
        weatherChart.destroy();
    }

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

iconButtons.forEach(button => {
    button.addEventListener("click", () => {
        const panelId = button.dataset.panel;
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

            setTimeout(() => {
                map.invalidateSize();
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

        setTimeout(() => {
            map.invalidateSize();
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
    if (!weatherArea) {
        return;
    }

    const styles = {
        temperature: {
            color: "#6d8ea0",
            fillColor: "#7da7b9",
            radius: 180000
        },

        wind: {
            color: "#577d91",
            fillColor: "#7899a8",
            radius: 250000
        },

        snow: {
            color: "#91a9b5",
            fillColor: "#c5d4da",
            radius: 220000
        },

        visibility: {
            color: "#718b99",
            fillColor: "#9eb3bc",
            radius: 200000
        },

        storm: {
            color: "#805f59",
            fillColor: "#9b7168",
            radius: 350000
        },

        pressure: {
            color: "#667f8d",
            fillColor: "#829ba7",
            radius: 160000
        }
    };

    const style = styles[layer] || styles.temperature;

    weatherArea.setStyle({
        color: style.color,
        fillColor: style.fillColor,
        radius: style.radius
    });
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

    if (simulationMode === "emergency") {

        simulationInputTitle.textContent =
            "Station Conditions";

        simulationInputDescription.textContent =
            "Simulate how the station responds to changing environmental conditions during the selected period.";

        simulationBasis.textContent =
            "Daily environmental conditions affect heating demand, power generation, fuel consumption, transport availability and operational risk.";
    }

    else if (simulationMode === "climate") {

        simulationInputTitle.textContent =
            "Climate Risk Assessment";

        simulationInputDescription.textContent =
            "Evaluate how environmental conditions affect station operations across the selected period.";

        simulationBasis.textContent =
            "The simulation identifies recurring high-risk conditions and their effect on station energy and logistics.";
    }

    else if (simulationMode === "infrastructure") {

        simulationInputTitle.textContent =
            "Infrastructure Planning";

        simulationInputDescription.textContent =
            "Evaluate how the infrastructure currently added to the station improves energy resilience and reduces fuel dependency.";

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

function getBaseConditions() {

    const temperature =
        Number.parseFloat(
            document.getElementById("liveTemperature")?.textContent
        );

    const wind =
        Number.parseFloat(
            document.getElementById("liveWind")?.textContent
        );

    return {
        temperature:
            Number.isFinite(temperature)
                ? temperature
                : -18,

        wind:
            Number.isFinite(wind)
                ? wind
                : 8
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
                    25 +
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
    let fuelSaved = 0;
    let batteryCapacity = 0;

    if (typeof stationInfrastructure === "undefined") {
        return {
            renewableEnergy: 0,
            fuelSaved: 0,
            batteryCapacity: 0
        };
    }

    stationInfrastructure.forEach(item => {

        if (item.energy > 0) {
            renewableEnergy += item.energy;
        }

        if (item.fuel > 0) {
            fuelSaved += item.fuel;
        }

        if (item.unit === "kWh") {
            batteryCapacity += item.capacity;
        }
    });

    return {
        renewableEnergy,
        fuelSaved,
        batteryCapacity
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

    const days =
        getSimulationDays(
            startDate,
            endDate
        );

    const dailyConditions =
        generateDailyConditions(
            startDate,
            days
        );

    const infrastructure =
        getInfrastructureSimulationImpact();

    let fuelRemaining = initialFuel;
    let totalFuelUsed = 0;
    let totalEnergyDemand = 0;
    let totalRenewableEnergy = 0;
    let peakRisk = 0;
    let highRiskDays = 0;
    let minimumTransport = 100;

    dailyConditions.forEach(condition => {

        let risk =
            calculateDailyRisk(condition);

        if (simulationMode === "emergency") {
            risk = Math.min(
                100,
                risk + 10
            );
        }

        if (simulationMode === "climate") {
            risk = Math.min(
                100,
                risk + (
                    condition.temperature <= -25
                        ? 5
                        : 0
                )
            );
        }

        peakRisk =
            Math.max(
                peakRisk,
                risk
            );

        if (risk >= 40) {
            highRiskDays++;
        }

        const heatingFactor =
            Math.max(
                0,
                (-condition.temperature - 10) / 30
            );

        const energyDemand =
            dailyEnergy *
            (
                1 +
                heatingFactor * 0.35
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
            energyDemand *
            weatherRenewableFactor;

        renewableEnergy +=
            infrastructure.renewableEnergy;

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

        const fuelUsed =
            dieselEnergy / 10;

        totalFuelUsed +=
            fuelUsed;

        fuelRemaining =
            Math.max(
                0,
                fuelRemaining -
                fuelUsed
            );

        let transport =
            100;

        transport -=
            condition.storm * 0.6;

        transport -=
            condition.snowfall * 0.25;

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

    let resupply = "NOT REQUIRED";

    if (fuelRemaining <= 0) {
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

    document.getElementById(
        "simulationLogisticsImpact"
    ).textContent =
        `${modeText}: ${highRiskDays} high-risk days detected. ` +
        `Minimum transport availability was ${Math.round(minimumTransport)}%. ` +
        `Average renewable generation was ${Math.round(averageRenewable).toLocaleString("en-IN")} kWh/day. ` +
        `Fuel consumption was approximately ${Math.round(totalFuelUsed).toLocaleString("en-IN")} L ` +
        `for ${personnel} personnel. ` +
        `Water stock: ${waterStock.toLocaleString("en-IN")} L.`;

    if (mapDataStatus) {
        mapDataStatus.textContent =
            `Simulation complete — ${days} days`;
    }

    updateInfrastructureSimulationImpact(
        totalEnergyDemand,
        totalFuelUsed
    );
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

    const fuelSaved =
        Math.min(
            infrastructure.fuelSaved,
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
}

const runSimulationButton =
    document.getElementById("runSimulation");

runSimulationButton?.addEventListener(
    "click",
    runDigitalTwinSimulation
);

updateSimulationMode();

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

setupEnvironmentEffects();

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

    }
);

updateInfrastructureControls();
renderInfrastructure();

function updateLogistics() {

    const snow = 30;
    const visibility = 80;
    const storm = 10;
    const wind = 8;

    const resourceType =
        document.getElementById("resourceType")?.value || "fuel";

    const resources = {
        fuel: {
            stock: 10000,
            unit: "L",
            daily: 250
        },

        food: {
            stock: 3000,
            unit: "kg",
            daily: 50
        },

        water: {
            stock: 6000,
            unit: "L",
            daily: 150
        },

        medical: {
            stock: 500,
            unit: "units",
            daily: 3
        }
    };

    const resource = resources[resourceType];

    let transport = 100;

    transport -= storm * 0.6;
    transport -= snow * 0.25;
    transport -= Math.max(0, wind - 40) * 0.4;
    transport -= Math.max(0, 60 - visibility) * 0.3;

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

    let requiredResupply =
        daysRemaining < simulationDays;

    let risk = "LOW";

    if (transport < 70 || requiredResupply) {
        risk = "MEDIUM";
    }

    if (transport < 40 || daysRemaining < 7) {
        risk = "HIGH";
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

    const resupplyStatus =
        document.getElementById("resupplyStatus");

    const resupplyMessage =
        document.getElementById("resupplyMessage");

    if (requiredResupply) {

        resupplyStatus.textContent =
            "Resupply Required";

        resupplyMessage.textContent =
            `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} ` +
            `will be depleted before the simulation period ends. ` +
            `Resupply planning is required.`;

    } else {

        resupplyStatus.textContent =
            "Resupply Not Required";

        resupplyMessage.textContent =
            `Current ${resourceType} stock is sufficient for the ` +
            `${simulationDays}-day simulation period.`;
    }
}

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



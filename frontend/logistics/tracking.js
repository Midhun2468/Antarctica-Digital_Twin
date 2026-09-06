// ============================================================
// LOGISTICS TRACKING MODULE
// Phase 2 - Cargo Tracking Foundation
// ============================================================

window.LogisticsTracking = {

    // --------------------------------------------------------
    // SIMULATION CONTROL
    // --------------------------------------------------------

    simulationTimer: null,

    // --------------------------------------------------------
    // SIMULATED RESUPPLY MISSIONS
    // --------------------------------------------------------

    shipments: [

        {
            id: "SUP-001",

            cargo: "Fuel + Generator Spares",

            quantity: "8,000 L fuel",

            origin: "Goa, India",

            destination: "Maitri Station",

            mode: "Supply Vessel",

            status: "IN TRANSIT",

            progress: 68,

            etaDays: 12,

            plannedEtaDays: 14,

            risk: "LOW"
        },

        {
            id: "SUP-002",

            cargo: "Food & Medical Supplies",

            quantity: "4.2 tonnes",

            origin: "Cape Town, South Africa",

            destination: "Bharati Station",

            mode: "Aircraft",

            status: "SCHEDULED",

            progress: 0,

            etaDays: 21,

            plannedEtaDays: 21,

            risk: "LOW"
        }

    ],

    // --------------------------------------------------------
    // INITIALIZE
    // --------------------------------------------------------

    init() {

    console.log(
        "Logistics tracking module initialized."
    );

    this.render();

    this.startSimulation();

},

    // --------------------------------------------------------
    // GET ACTIVE SHIPMENT
    // --------------------------------------------------------

    getActiveShipment() {

        return this.shipments.find(
            shipment =>
                shipment.status === "IN TRANSIT"
        );

    },

    // --------------------------------------------------------
    // GET STATUS LABEL
    // --------------------------------------------------------

    getStatusLabel(shipment) {

        if (!shipment) {

            return "NO ACTIVE SHIPMENT";

        }

        return shipment.status;

    },

    // --------------------------------------------------------
    // CALCULATE SCHEDULE CONDITION
    // --------------------------------------------------------

    getScheduleCondition(shipment) {

        if (!shipment) {

            return "UNKNOWN";

        }

        if (
            shipment.etaDays <=
            shipment.plannedEtaDays
        ) {

            return "ON SCHEDULE";

        }

        return "DELAYED";

    },
    // --------------------------------------------------------
// CALCULATE WEATHER IMPACT
// --------------------------------------------------------

calculateWeatherImpact() {

    const temperature =
        Number(
            document.getElementById(
                "liveTemperature"
            )?.textContent
        );

    const wind =
        Number(
            document.getElementById(
                "liveWind"
            )?.textContent
        );

    const currentTemperature =
        Number.isFinite(temperature)
            ? temperature
            : -18;

    const currentWind =
        Number.isFinite(wind)
            ? wind
            : 8;

    let factor = 1;

    // Strong winds slow transport.

    if (currentWind >= 25) {

        factor *= 0.55;

    }
    else if (currentWind >= 18) {

        factor *= 0.75;

    }

    // Extreme cold slows transport.

    if (currentTemperature <= -35) {

        factor *= 0.65;

    }
    else if (currentTemperature <= -25) {

        factor *= 0.85;

    }

    return Math.max(
        0.35,
        Math.min(1, factor)
    );

},
// --------------------------------------------------------
// UPDATE JOURNEY
// --------------------------------------------------------

updateJourney() {

    const shipment =
        this.getActiveShipment();

    if (!shipment) {

        return;

    }

    const weatherFactor =
        this.calculateWeatherImpact();

    // --------------------------------------------
    // PROGRESS
    // --------------------------------------------

    const baseProgressStep = 1;

    const progressStep =
        baseProgressStep *
        weatherFactor;

    shipment.progress =
        Math.min(
            100,
            shipment.progress +
            progressStep
        );

    // --------------------------------------------
    // ETA
    // --------------------------------------------

    const etaReduction =
        0.05 *
        weatherFactor;

    
    shipment.etaDays =
        Math.max(
            0,
            shipment.etaDays -
            etaReduction
        );

    // --------------------------------------------
    // UPDATE STATUS
    // --------------------------------------------

    if (
        shipment.progress >= 100 ||
        shipment.etaDays <= 0
    ) {

        shipment.progress = 100;

        shipment.etaDays = 0;

        shipment.status = "ARRIVED";

    }
    else {

        shipment.status = "IN TRANSIT";

    }

    // --------------------------------------------
    // DETERMINE DELAY RISK
    // --------------------------------------------

   if (weatherFactor < 0.6) {

    shipment.risk = "HIGH";
    shipment.condition = "SEVERE";

}
else if (weatherFactor < 0.85) {

    shipment.risk = "MEDIUM";
    shipment.condition = "DEGRADED";

}
else {

    shipment.risk = "LOW";
    shipment.condition = "NORMAL";

}

    this.update();


if (
    window.LogisticsRoute &&
    typeof LogisticsRoute.update ===
        "function"
) {

    LogisticsRoute.update();

}


if (
    window.LogisticsPrediction &&
    typeof window.LogisticsPrediction.update === "function"
) {

    window.LogisticsPrediction.update();

}
if (
    window.LogisticsRecommendation &&
    typeof window.LogisticsRecommendation.update ===
    "function"
) {

    window.LogisticsRecommendation.update();

}

},
// --------------------------------------------------------
// START JOURNEY SIMULATION
// --------------------------------------------------------

startSimulation() {

    if (this.simulationTimer) {

        clearInterval(
            this.simulationTimer
        );

    }

    this.simulationTimer =
        setInterval(
            () => {

                this.updateJourney();

            },
            3000
        );

},

    // --------------------------------------------------------
    // RENDER TRACKING SECTION
    // --------------------------------------------------------

    render() {

        const panel =
            document.getElementById(
                "logisticsPanel"
            );

        if (!panel) {

            console.error(
                "Logistics panel not found."
            );

            return;

        }

        // Prevent duplicate rendering.

        if (
            document.getElementById(
                "logisticsTrackingSection"
            )
        ) {

            return;

        }

        const section =
            document.createElement("div");

        section.id =
            "logisticsTrackingSection";

        section.className =
            "side-section logistics-tracking-section";

        section.innerHTML = `

            <div class="section-heading">

                <h3>Resupply Tracking</h3>

                <span class="tracking-live-label">
                    SIMULATED
                </span>

            </div>

            <div
                id="activeShipmentCard"
                class="shipment-card"
            ></div>

        `;

        panel.appendChild(section);

        this.update();

    },

    // --------------------------------------------------------
    // UPDATE TRACKING UI
    // --------------------------------------------------------

    update() {

        const card =
            document.getElementById(
                "activeShipmentCard"
            );

        if (!card) {

            return;

        }

        const shipment =
            this.getActiveShipment();

        if (!shipment) {

            card.innerHTML = `

                <div class="shipment-empty">
                    No active resupply mission.
                </div>

            `;

            return;

        }

        const schedule =
            this.getScheduleCondition(
                shipment
            );

        card.innerHTML = `

            <div class="shipment-header">

                <div>

                    <span class="shipment-label">
                        ACTIVE CARGO
                    </span>

                    <strong>
                        ${shipment.id}
                    </strong>

                </div>

                <span class="shipment-status">
                    ${this.getStatusLabel(shipment)}
                </span>

            </div>


            <div class="shipment-cargo">

                <strong>
                    ${shipment.cargo}
                </strong>

                <span>
                    ${shipment.quantity}
                </span>

            </div>


            <div class="shipment-route">

                <div>

                    <span>ORIGIN</span>

                    <strong>
                        ${shipment.origin}
                    </strong>

                </div>

                <div class="route-arrow">
                    →
                </div>

                <div>

                    <span>DESTINATION</span>

                    <strong>
                        ${shipment.destination}
                    </strong>

                </div>

            </div>


            <div class="shipment-details">

    <div>

        <span>TRANSPORT</span>

        <strong>
            ${shipment.mode}
        </strong>

    </div>

    <div>

        <span>ETA</span>

        <strong>
            ${shipment.etaDays.toFixed(1)} days
        </strong>

    </div>

    <div>

        <span>CONDITION</span>

        <strong>
            ${shipment.condition || "NORMAL"}
        </strong>

    </div>

</div>


            <div class="shipment-progress">

                <div class="shipment-progress-header">

                    <span>
                        Journey Progress
                    </span>

                    <strong>
                        ${shipment.progress}%
                    </strong>

                </div>

                <div class="shipment-progress-track">

                    <div
                        class="shipment-progress-fill"
                        style="width: ${shipment.progress}%"
                    ></div>

                </div>

            </div>

        `;

    }

};


// ============================================================
// START TRACKING MODULE
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        window.LogisticsTracking.init();

    }
);
// ============================================================
// LOGISTICS TRACKING MODULE
// Phase 2 - Multimodal Cargo Tracking
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
            risk: "LOW",
            condition: "NORMAL"
        },

        {
            id: "SUP-002",
            cargo: "Food & Medical Supplies",
            quantity: "4.2 tonnes",
            origin: "Cape Town, South Africa",
            destination: "Bharati Station",
            mode: "Aircraft",
            status: "IN TRANSIT",
            progress: 35,
            etaDays: 21,
            plannedEtaDays: 21,
            risk: "LOW",
            condition: "NORMAL"
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
    // GET ALL ACTIVE SHIPMENTS
    // --------------------------------------------------------

    getActiveShipments() {

        return this.shipments.filter(
            shipment =>
                shipment.status === "IN TRANSIT"
        );

    },


    // --------------------------------------------------------
    // GET PRIMARY ACTIVE SHIPMENT
    // --------------------------------------------------------
    //
    // Kept for compatibility with the existing
    // Prediction / Recommendation / Command modules.
    //
    // SUP-001 remains the primary shipment.
    // --------------------------------------------------------

    getActiveShipment() {

        return this.shipments.find(
            shipment =>
                shipment.status === "IN TRANSIT"
        );

    },


    // --------------------------------------------------------
    // STATUS LABEL
    // --------------------------------------------------------

    getStatusLabel(shipment) {

        if (!shipment) {

            return "NO ACTIVE SHIPMENT";

        }

        return shipment.status;

    },


    // --------------------------------------------------------
    // SCHEDULE CONDITION
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
    // WEATHER IMPACT
    // --------------------------------------------------------

    calculateWeatherImpact(shipment = null) {

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


        // Strong winds

        if (currentWind >= 25) {

            factor *= 0.55;

        }
        else if (currentWind >= 18) {

            factor *= 0.75;

        }


        // Extreme cold

        if (currentTemperature <= -35) {

            factor *= 0.65;

        }
        else if (currentTemperature <= -25) {

            factor *= 0.85;

        }


        // Aircraft-specific sensitivity

        if (
            shipment &&
            shipment.mode === "Aircraft"
        ) {

            if (currentWind >= 25) {

                factor *= 0.90;

            }
            else if (currentWind >= 18) {

                factor *= 0.95;

            }

        }


        return Math.max(
            0.35,
            Math.min(
                1,
                factor
            )
        );

    },


    // --------------------------------------------------------
    // UPDATE ALL ACTIVE JOURNEYS
    // --------------------------------------------------------

    updateJourney() {

        const activeShipments =
            this.getActiveShipments();


        if (!activeShipments.length) {

            this.update();

            return;

        }


        activeShipments.forEach(
            shipment => {

                const weatherFactor =
                    this.calculateWeatherImpact(
                        shipment
                    );


                // Progress

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


                // ETA

                const etaReduction =
                    0.05 *
                    weatherFactor;

                shipment.etaDays =
                    Math.max(
                        0,
                        shipment.etaDays -
                        etaReduction
                    );


                // Status

                if (
                    shipment.progress >= 100 ||
                    shipment.etaDays <= 0
                ) {

                    shipment.progress = 100;

                    shipment.etaDays = 0;

                    shipment.status = "ARRIVED";

                    shipment.risk = "LOW";

                    shipment.condition = "NORMAL";

                }
                else {

                    shipment.status =
                        "IN TRANSIT";


                    if (weatherFactor < 0.6) {

                        shipment.risk = "HIGH";

                        shipment.condition =
                            "SEVERE";

                    }
                    else if (weatherFactor < 0.85) {

                        shipment.risk = "MEDIUM";

                        shipment.condition =
                            "DEGRADED";

                    }
                    else {

                        shipment.risk = "LOW";

                        shipment.condition =
                            "NORMAL";

                    }

                }

            }
        );


        // Refresh Tracking UI

        this.update();


        // Refresh Route

        if (
            window.LogisticsRoute &&
            typeof LogisticsRoute.update ===
                "function"
        ) {

            LogisticsRoute.update();

        }


        // Refresh Prediction

        if (
            window.LogisticsPrediction &&
            typeof window.LogisticsPrediction.update ===
                "function"
        ) {

            window.LogisticsPrediction.update();

        }


        // Refresh Recommendation

        if (
            window.LogisticsRecommendation &&
            typeof window.LogisticsRecommendation.update ===
                "function"
        ) {

            window.LogisticsRecommendation.update();

        }

    },


    // --------------------------------------------------------
    // START SIMULATION
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


        if (
            document.getElementById(
                "logisticsTrackingSection"
            )
        ) {

            return;

        }


        const section =
            document.createElement(
                "div"
            );


        section.id =
            "logisticsTrackingSection";


        section.className =
            "side-section logistics-tracking-section";


        section.innerHTML = `

            <div class="section-heading">

                <div>

                    <h3>
                        Resupply Tracking
                    </h3>

                    <p class="tracking-subtitle">
                        Live multimodal shipment status
                    </p>

                </div>

                <span class="tracking-live-label">
                    SIMULATED
                </span>

            </div>


            <div
                id="activeShipmentCards"
                class="shipment-cards"
            ></div>

        `;


        panel.appendChild(
            section
        );


        this.update();

    },


    // --------------------------------------------------------
    // CREATE ONE SHIPMENT CARD
    // --------------------------------------------------------

    createShipmentCard(shipment) {

        const schedule =
            this.getScheduleCondition(
                shipment
            );


        const icon =
            shipment.mode === "Aircraft"
                ? "✈️"
                : shipment.mode === "Supply Vessel"
                    ? "🚢"
                    : "📦";


        const riskClass =
            String(
                shipment.risk || "LOW"
            ).toLowerCase();


        const conditionClass =
            String(
                shipment.condition || "NORMAL"
            ).toLowerCase();


        return `

            <div class="
                shipment-card
                shipment-${riskClass}
            ">

                <div class="shipment-header">

                    <div class="shipment-title-group">

                        <span class="shipment-label">
                            ACTIVE CARGO
                        </span>

                        <strong>
                            ${icon}
                            ${shipment.id}
                        </strong>

                    </div>

                    <span class="
                        shipment-status
                        status-${riskClass}
                    ">
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

                        <span>
                            ORIGIN
                        </span>

                        <strong>
                            ${shipment.origin}
                        </strong>

                    </div>

                    <div class="route-arrow">
                        →
                    </div>

                    <div>

                        <span>
                            DESTINATION
                        </span>

                        <strong>
                            ${shipment.destination}
                        </strong>

                    </div>

                </div>


                <div class="shipment-details">

                    <div>

                        <span>
                            TRANSPORT
                        </span>

                        <strong>
                            ${icon}
                            ${shipment.mode}
                        </strong>

                    </div>


                    <div>

                        <span>
                            ETA
                        </span>

                        <strong>
                            ${Number(
                                shipment.etaDays
                            ).toFixed(1)} days
                        </strong>

                    </div>


                    <div>

                        <span>
                            CONDITION
                        </span>

                        <strong>
                            ${shipment.condition || "NORMAL"}
                        </strong>

                    </div>


                    <div>

                        <span>
                            SCHEDULE
                        </span>

                        <strong>
                            ${schedule}
                        </strong>

                    </div>

                </div>


                <div class="shipment-progress">

                    <div class="shipment-progress-header">

                        <span>
                            Journey Progress
                        </span>

                        <strong>
                            ${Number(
                                shipment.progress
                            ).toFixed(0)}%
                        </strong>

                    </div>


                    <div class="shipment-progress-track">

                        <div
                            class="shipment-progress-fill"
                            style="
                                width:
                                ${Math.max(
                                    0,
                                    Math.min(
                                        100,
                                        shipment.progress
                                    )
                                )}%
                            "
                        ></div>

                    </div>

                </div>

            </div>

        `;

    },


    // --------------------------------------------------------
    // UPDATE TRACKING UI
    // --------------------------------------------------------

    update() {

        const container =
            document.getElementById(
                "activeShipmentCards"
            );


        if (!container) {

            return;

        }


        const activeShipments =
            this.getActiveShipments();


        // ----------------------------------------------------
        // NO ACTIVE SHIPMENTS
        // ----------------------------------------------------

        if (!activeShipments.length) {

            const arrivedShipments =
                this.shipments.filter(
                    shipment =>
                        shipment.status ===
                        "ARRIVED"
                );


            if (arrivedShipments.length) {

                container.innerHTML = `

                    <div class="shipment-empty">

                        All active missions have
                        reached their destination.

                    </div>

                `;

            }
            else {

                container.innerHTML = `

                    <div class="shipment-empty">

                        No active resupply mission.

                    </div>

                `;

            }


            return;

        }


        // ----------------------------------------------------
        // RENDER EVERY ACTIVE SHIPMENT
        // ----------------------------------------------------

        container.innerHTML =
            activeShipments
                .map(
                    shipment =>
                        this.createShipmentCard(
                            shipment
                        )
                )
                .join("");

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
// ============================================================
// LOGISTICS COMMAND STATUS MODULE
// Phase 5 - Operational Decision Dashboard
// ============================================================

window.LogisticsCommand = {

    initialized: false,

    updateTimer: null,


    // ========================================================
    // LOGISTICS PANEL
    // ========================================================

    isLogisticsOpen() {

        const panel =
            document.getElementById(
                "logisticsPanel"
            );

        if (!panel) {
            return false;
        }

        return !panel.classList.contains(
            "hidden"
        );

    },


    // ========================================================
    // RESOURCE DATA
    // ========================================================

    getResourceData() {

        if (
            window.LogisticsModule &&
            typeof LogisticsModule.getResourceData ===
                "function"
        ) {

            return LogisticsModule.getResourceData();

        }

        return null;

    },


    // ========================================================
    // PREDICTION
    // ========================================================

    getPrediction() {

        if (
            window.LogisticsPrediction &&
            typeof LogisticsPrediction.calculate ===
                "function"
        ) {

            return LogisticsPrediction.calculate();

        }

        return null;

    },


    // ========================================================
    // PRIMARY SHIPMENT
    // ========================================================

    getShipment() {

        if (
            window.LogisticsTracking &&
            typeof LogisticsTracking.getActiveShipment ===
                "function"
        ) {

            return LogisticsTracking.getActiveShipment();

        }

        return null;

    },


    // ========================================================
    // TRANSPORT AVAILABILITY
    // ========================================================

    getTransportAvailability() {

        /*
         * The resource module may expose transport
         * availability in different ways depending
         * on the current prototype state.
         */

        const resource =
            this.getResourceData();


        if (
            resource &&
            Number.isFinite(
                Number(resource.transportAvailability)
            )
        ) {

            return Number(
                resource.transportAvailability
            );

        }


        if (
            resource &&
            Number.isFinite(
                Number(resource.transport)
            )
        ) {

            return Number(
                resource.transport
            );

        }


        /*
         * Use the Transport module if available.
         */

        if (
            window.LogisticsTransport &&
            typeof LogisticsTransport.calculate ===
                "function"
        ) {

            const transport =
                LogisticsTransport.calculate();


            if (
                transport &&
                Number.isFinite(
                    Number(
                        transport.availability
                    )
                )
            ) {

                return Number(
                    transport.availability
                );

            }


            if (
                transport &&
                Number.isFinite(
                    Number(
                        transport.score
                    )
                )
            ) {

                return Number(
                    transport.score
                );

            }

        }


        /*
         * Prototype fallback.
         *
         * This is only used when the current
         * modules have not exposed a value yet.
         */

        return 100;

    },


    // ========================================================
    // RESOURCE AUTONOMY
    // ========================================================

    getResourceAutonomy(resource) {

        if (!resource) {
            return null;
        }


        /*
         * Use directly supplied autonomy if available.
         */

        if (
            Number.isFinite(
                Number(resource.autonomy)
            )
        ) {

            return Number(
                resource.autonomy
            );

        }


        /*
         * Calculate autonomy from:
         *
         * Stock / Daily Use
         */

        const stock =
            Number(
                resource.stock
            );


        const dailyUse =
            Number(
                resource.dailyUse
            );


        if (
            Number.isFinite(stock) &&
            Number.isFinite(dailyUse) &&
            dailyUse > 0
        ) {

            return stock / dailyUse;

        }


        return null;

    },


    // ========================================================
    // OVERALL STATUS
    // ========================================================

    calculateStatus() {

        const resource =
            this.getResourceData();


        const prediction =
            this.getPrediction();


        const shipment =
            this.getShipment();


        let severityScore = 0;


        // Resource risk

        if (resource) {

            const risk =
                String(
                    resource.risk || "LOW"
                ).toUpperCase();


            if (risk === "CRITICAL") {

                severityScore += 4;

            }
            else if (risk === "HIGH") {

                severityScore += 3;

            }
            else if (risk === "MEDIUM") {

                severityScore += 2;

            }

        }


        // Prediction risk

        if (prediction) {

            const level =
                String(
                    prediction.level || "SAFE"
                ).toUpperCase();


            if (level === "CRITICAL") {

                severityScore += 4;

            }
            else if (level === "HIGH") {

                severityScore += 3;

            }
            else if (level === "MEDIUM") {

                severityScore += 2;

            }

        }


        // Shipment risk

        if (shipment) {

            const shipmentRisk =
                String(
                    shipment.risk || "LOW"
                ).toUpperCase();


            if (
                shipmentRisk ===
                "HIGH"
            ) {

                severityScore += 3;

            }
            else if (
                shipmentRisk ===
                "MEDIUM"
            ) {

                severityScore += 2;

            }

        }


        if (severityScore >= 7) {

            return {

                level: "CRITICAL",

                title:
                    "CRITICAL LOGISTICS RISK",

                message:
                    "Immediate logistics intervention required.",

                icon:
                    "!"

            };

        }


        if (severityScore >= 4) {

            return {

                level: "ATTENTION",

                title:
                    "ATTENTION REQUIRED",

                message:
                    "Logistics conditions require operational attention.",

                icon:
                    "!"

            };

        }


        if (severityScore >= 2) {

            return {

                level: "MONITOR",

                title:
                    "MONITOR OPERATIONS",

                message:
                    "Operations are stable but should be monitored.",

                icon:
                    "•"

            };

        }


        return {

            level: "READY",

            title:
                "LOGISTICS READY",

            message:
                "Resources and resupply operations are within safe limits.",

            icon:
                "✓"

        };

    },


    // ========================================================
    // RECOMMENDED ACTION
    // ========================================================

    getRecommendedAction() {

        if (
            window.LogisticsRecommendation &&
            typeof LogisticsRecommendation.generateRecommendation ===
                "function"
        ) {

            const recommendation =
                LogisticsRecommendation.generateRecommendation();


            if (recommendation) {

                return {

                    title:
                        recommendation.title ||
                        "Operational Monitoring",

                    action:
                        recommendation.action ||
                        "Continue monitoring logistics conditions."

                };

            }

        }


        return {

            title:
                "Operational Monitoring",

            action:
                "Continue monitoring resource autonomy and shipment conditions."

        };

    },


    // ========================================================
    // RENDER
    // ========================================================

    render() {

        const panel =
            document.getElementById(
                "logisticsPanel"
            );


        if (!panel) {
            return;
        }


        const existing =
            document.getElementById(
                "logisticsCommandSection"
            );


        if (existing) {

            existing.remove();

        }


        const resource =
            this.getResourceData();


        const prediction =
            this.getPrediction();


        const shipment =
            this.getShipment();


        const overall =
            this.calculateStatus();


        const recommendation =
            this.getRecommendedAction();


        // ----------------------------------------------------
        // RESOURCE AUTONOMY
        // ----------------------------------------------------

        const autonomy =
            this.getResourceAutonomy(
                resource
            );


        const autonomyDisplay =
            autonomy !== null
                ? Math.round(
                    autonomy
                ) + " days"
                : "--";


        const resourceName =
            resource
                ? (
                    resource.name ||
                    resource.resource ||
                    "Resource"
                )
                : "Resource";


        // ----------------------------------------------------
        // TRANSPORT AVAILABILITY
        // ----------------------------------------------------

        const transport =
            this.getTransportAvailability();


        const transportDisplay =
            Number.isFinite(
                Number(transport)
            )
                ? Math.round(
                    Number(transport)
                ) + "%"
                : "--";


        // ----------------------------------------------------
        // SUPPLY GAP
        // ----------------------------------------------------

        const gapDays =
            prediction &&
            Number.isFinite(
                Number(
                    prediction.gapDays
                )
            )
                ? Math.max(
                    0,
                    Number(
                        prediction.gapDays
                    )
                )
                : 0;


        const gapDisplay =
            gapDays > 0
                ? Math.ceil(
                    gapDays
                ) + " days"
                : "NONE";


        // ----------------------------------------------------
        // SHIPMENT
        // ----------------------------------------------------

        const shipmentStatus =
            shipment
                ? shipment.status
                : "NO DATA";


        const shipmentEta =
            shipment &&
            Number.isFinite(
                Number(
                    shipment.etaDays
                )
            )
                ? Math.ceil(
                    Number(
                        shipment.etaDays
                    )
                )
                : "--";


        const shipmentIcon =
            shipment &&
            shipment.mode ===
                "Aircraft"
                ? "✈️"
                : "🚢";


        // ----------------------------------------------------
        // CREATE SECTION
        // ----------------------------------------------------

        const section =
            document.createElement(
                "div"
            );


        section.id =
            "logisticsCommandSection";


        section.className =
            "logistics-command-section";


        section.innerHTML = `

            <div class="command-header">

                <div>

                    <div class="command-eyebrow">
                        OPERATIONS OVERVIEW
                    </div>

                    <h3>
                        Logistics Command Status
                    </h3>

                    <p>
                        Consolidated operational
                        readiness from current
                        logistics intelligence.
                    </p>

                </div>


                <div
                    class="
                        command-status-badge
                        ${overall.level.toLowerCase()}
                    "
                >

                    ${overall.icon}
                    ${overall.level}

                </div>

            </div>


            <div class="command-metrics">


                <div class="command-metric">

                    <span>
                        RESOURCE AUTONOMY
                    </span>

                    <strong>
                        ${autonomyDisplay}
                    </strong>

                    <small>
                        ${resourceName}
                    </small>

                </div>


                <div class="command-metric">

                    <span>
                        SHIPMENT
                    </span>

                    <strong>
                        ${shipmentIcon}
                        ${shipmentStatus}
                    </strong>

                    <small>
                        ETA:
                        ${shipmentEta}
                        days
                    </small>

                </div>


                <div class="command-metric">

                    <span>
                        TRANSPORT
                    </span>

                    <strong>
                        ${transportDisplay}
                    </strong>

                    <small>
                        Availability
                    </small>

                </div>


                <div class="command-metric">

                    <span>
                        SUPPLY GAP
                    </span>

                    <strong>
                        ${gapDisplay}
                    </strong>

                    <small>
                        Autonomy vs shipment ETA
                    </small>

                </div>


            </div>


            <div
                class="
                    command-overall
                    ${overall.level.toLowerCase()}
                "
            >

                <div class="command-overall-icon">

                    ${overall.icon}

                </div>


                <div>

                    <span>
                        OVERALL READINESS
                    </span>

                    <strong>
                        ${overall.title}
                    </strong>

                    <p>
                        ${overall.message}
                    </p>

                </div>

            </div>


            <div class="command-action">

                <div>

                    <span>
                        RECOMMENDED ACTION
                    </span>

                    <strong>
                        ${recommendation.title}
                    </strong>

                </div>


                <p>
                    ${recommendation.action}
                </p>

            </div>


            <div class="command-source-note">

                Status is derived from resource,
                shipment, prediction and transport
                modules.

            </div>

        `;


        // ----------------------------------------------------
        // PLACE COMMAND SECTION
        // ----------------------------------------------------

        const recommendationSection =
            document.getElementById(
                "resupplyRecommendationSection"
            );


        const transportSection =
            document.getElementById(
                "logisticsTransportSection"
            );


        const routeSection =
            document.getElementById(
                "logisticsRouteSection"
            );


        if (recommendationSection) {

            recommendationSection.after(
                section
            );

        }
        else if (transportSection) {

            transportSection.before(
                section
            );

        }
        else if (routeSection) {

            routeSection.before(
                section
            );

        }
        else {

            panel.appendChild(
                section
            );

        }


        this.initialized = true;

    },


    // ========================================================
    // UPDATE
    // ========================================================

    update() {

        if (
            !this.isLogisticsOpen()
        ) {

            return;

        }


        this.render();

    },


    // ========================================================
    // AUTO UPDATE
    // ========================================================

    startAutoUpdate() {

        if (
            this.updateTimer
        ) {

            return;

        }


        this.updateTimer =
            setInterval(
                () => {

                    if (
                        this.isLogisticsOpen()
                    ) {

                        this.update();

                    }

                },
                3000
            );

    },


    // ========================================================
    // INITIALIZE
    // ========================================================

    init() {

        console.log(
            "Logistics command status initialized."
        );


        if (
            this.isLogisticsOpen()
        ) {

            this.render();

        }


        this.startAutoUpdate();

    }

};


// ============================================================
// START COMMAND MODULE
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        if (
            window.LogisticsCommand &&
            typeof LogisticsCommand.init ===
                "function"
        ) {

            LogisticsCommand.init();

        }

    }
);
window.LogisticsCommand = {

    initialized: false,

    updateTimer: null,


    /*
     * Determine whether Logistics is currently open.
     */

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


    /*
     * Safely obtain the current resource state.
     */

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


    /*
     * Safely obtain the supply prediction.
     */

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


    /*
     * Safely obtain the active shipment.
     */

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


    /*
     * Calculate overall operational status.
     *
     * This combines the outputs of the existing
     * logistics modules rather than creating a
     * separate logistics calculation.
     */

    calculateStatus() {

        const resource =
            this.getResourceData();


        const prediction =
            this.getPrediction();


        const shipment =
            this.getShipment();


        let severityScore = 0;


        /*
         * Resource risk.
         */

        if (resource) {

            if (
                resource.risk === "CRITICAL"
            ) {

                severityScore += 4;

            }

            else if (
                resource.risk === "HIGH"
            ) {

                severityScore += 3;

            }

            else if (
                resource.risk === "MEDIUM"
            ) {

                severityScore += 2;

            }

        }


        /*
         * Supply prediction.
         */

        if (prediction) {

            if (
                prediction.level === "CRITICAL"
            ) {

                severityScore += 4;

            }

            else if (
                prediction.level === "HIGH"
            ) {

                severityScore += 3;

            }

            else if (
                prediction.level === "MEDIUM"
            ) {

                severityScore += 2;

            }

        }


        /*
         * Shipment risk.
         */

        if (shipment) {

            if (
                shipment.risk === "HIGH"
            ) {

                severityScore += 3;

            }

            else if (
                shipment.risk === "MEDIUM"
            ) {

                severityScore += 2;

            }

        }


        /*
         * Convert combined severity into
         * an operator-friendly status.
         */

        if (
            severityScore >= 7
        ) {

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


        if (
            severityScore >= 4
        ) {

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


        if (
            severityScore >= 2
        ) {

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


    /*
     * Determine the recommended action.
     *
     * Uses the existing recommendation engine
     * so Command Status remains consistent with
     * the Resupply Recommendation module.
     */

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


        /*
         * Fallback.
         */

        return {

            title:
                "Operational Monitoring",

            action:
                "Continue monitoring resource autonomy and shipment conditions."

        };

    },


    /*
     * Render the Command Status panel.
     */

    render() {

        const panel =
            document.getElementById(
                "logisticsPanel"
            );


        if (!panel) {

            return;

        }


        /*
         * Remove the previous Command Status
         * section before rebuilding it.
         */

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


        const section =
            document.createElement(
                "div"
            );


        section.id =
            "logisticsCommandSection";


        section.className =
            "logistics-command-section";


        const autonomy =
            resource &&
            Number.isFinite(
                Number(resource.autonomy)
            )
                ? Math.round(
                    Number(resource.autonomy)
                )
                : "--";


        const autonomyUnit =
            resource
                ? "days"
                : "";


        const transport =
            resource &&
            Number.isFinite(
                Number(resource.transport)
            )
                ? Math.round(
                    Number(resource.transport)
                )
                : "--";


        const gapDays =
            prediction
                ? Math.max(
                    0,
                    Math.ceil(
                        Number(
                            prediction.gapDays || 0
                        )
                    )
                )
                : 0;


        const shipmentStatus =
            shipment
                ? shipment.status
                : "NO DATA";


        const shipmentEta =
            shipment &&
            Number.isFinite(
                Number(shipment.etaDays)
            )
                ? Math.ceil(
                    Number(shipment.etaDays)
                )
                : "--";


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
                        ${autonomy}
                        ${autonomyUnit}
                    </strong>

                    <small>
                        ${
                            resource
                                ? resource.name ||
                                  resource.resource ||
                                  "Resource"
                                : "Resource"
                        }
                    </small>

                </div>


                <div class="command-metric">

                    <span>
                        SHIPMENT
                    </span>

                    <strong>
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
                        ${transport}%
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
                        ${
                            gapDays > 0
                                ? gapDays + " days"
                                : "NONE"
                        }
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


        /*
         * Place Command Status in the correct
         * order:
         *
         * Recommendation
         *        ↓
         * Command Status
         *        ↓
         * Transport
         *        ↓
         * Route
         */

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

            /*
             * Fallback if the other sections have
             * not been created yet.
             */

            panel.appendChild(
                section
            );

        }


        this.initialized = true;

    },


    /*
     * Refresh the Command Status panel.
     */

    update() {

        if (
            !this.isLogisticsOpen()
        ) {

            return;

        }


        this.render();

    },


    /*
     * Start automatic refresh.
     */

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


    /*
     * Initialize the module.
     */

    init() {

        console.log(
            "Logistics command status initialized."
        );


        /*
         * We only want Command Status visible
         * when the Logistics dashboard is open.
         */

        if (
            this.isLogisticsOpen()
        ) {

            this.render();

        }


        this.startAutoUpdate();

    }

};


/*
 * Initialize after DOM is ready.
 */

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
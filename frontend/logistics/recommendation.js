window.LogisticsRecommendation = {

    initialized: false,


    /*
     * -----------------------------------------
     * GET CURRENT PREDICTION
     * -----------------------------------------
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
     * -----------------------------------------
     * GET CURRENT RESOURCE
     * -----------------------------------------
     */

    getResource() {

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
     * -----------------------------------------
     * GET CURRENT SHIPMENT
     * -----------------------------------------
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
     * -----------------------------------------
     * CALCULATE RECOMMENDED QUANTITY
     *
     * Target:
     * 14 days of additional operational buffer
     * -----------------------------------------
     */

    calculateRecommendedQuantity(resource) {

        if (!resource) {

            return 0;

        }


        const dailyUse =
            Number(
                resource.dailyUse
            );


        if (
            !Number.isFinite(
                dailyUse
            ) ||
            dailyUse <= 0
        ) {

            return 0;

        }


        const targetBufferDays =
            14;


        const requiredQuantity =
            dailyUse *
            targetBufferDays;


        /*
         * Round quantities to practical
         * operational units.
         */

        return Math.ceil(
            requiredQuantity / 100
        ) * 100;

    },


    /*
     * -----------------------------------------
     * DETERMINE PRIORITY
     * -----------------------------------------
     */

    determinePriority(level) {

        const normalized =
            String(
                level || ""
            ).toUpperCase();


        if (
            normalized === "CRITICAL"
        ) {

            return "EMERGENCY";

        }


        if (
            normalized === "HIGH"
        ) {

            return "HIGH";

        }


        if (
            normalized === "MEDIUM"
        ) {

            return "MEDIUM";

        }


        return "ROUTINE";

    },


    /*
     * -----------------------------------------
     * DETERMINE OPERATIONAL ACTION
     * -----------------------------------------
     */

    determineAction(
        prediction,
        shipment
    ) {

        const level =
            String(
                prediction?.level || ""
            ).toUpperCase();


        const shipmentStatus =
            String(
                shipment?.status || ""
            ).toUpperCase();


        if (
            level === "CRITICAL"
        ) {

            return {

                title:
                    "Emergency Resupply",

                action:
                    "Dispatch emergency resources and prioritize the next available transport.",

                shortAction:
                    "Dispatch emergency resupply."

            };

        }


        if (
            level === "HIGH"
        ) {

            if (
                shipmentStatus ===
                "IN TRANSIT"
            ) {

                return {

                    title:
                        "Priority Shipment Monitoring",

                    action:
                        "Confirm the active shipment and prepare contingency resupply if arrival is delayed.",

                    shortAction:
                        "Monitor priority shipment."

                };

            }


            return {

                title:
                    "Priority Resupply",

                action:
                    "Prepare a priority resupply request and confirm the earliest suitable transport.",

                shortAction:
                    "Prepare priority resupply."

            };

        }


        if (
            level === "MEDIUM"
        ) {

            return {

                title:
                    "Contingency Preparation",

                action:
                    "Monitor consumption and prepare contingency resupply if the supply margin decreases.",

                shortAction:
                    "Prepare contingency plan."

            };

        }


        return {

            title:
                "Routine Monitoring",

            action:
                "Continue monitoring resource consumption, shipment progress and transport availability.",

            shortAction:
                "Continue monitoring."

        };

    },


    /*
     * -----------------------------------------
     * GENERATE COMPLETE RECOMMENDATION
     * -----------------------------------------
     */

    generateRecommendation() {

        const prediction =
            this.getPrediction();


        const resource =
            this.getResource();


        const shipment =
            this.getShipment();


        /*
         * If prediction is not ready,
         * return a safe fallback.
         */

        if (!prediction) {

            return {

                level:
                    "SAFE",

                priority:
                    "ROUTINE",

                resource:
                    resource?.name ||
                    resource?.resource ||
                    "Resource",

                quantity:
                    0,

                unit:
                    resource?.unit ||
                    "",

                title:
                    "Routine Monitoring",

                action:
                    "Continue monitoring resource consumption and shipment conditions."

            };

        }


        const level =
            String(
                prediction.level ||
                "SAFE"
            ).toUpperCase();


        const priority =
            this.determinePriority(
                level
            );


        const quantity =
            this.calculateRecommendedQuantity(
                resource
            );


        const action =
            this.determineAction(
                prediction,
                shipment
            );


        return {

            level:

                level,

            priority:

                priority,

            resource:

                resource?.resource ||
                "Resource",

            quantity:

                quantity,

            unit:

                resource?.unit ||
                "",

            title:

                action.title,

            action:

                action.action,

            shortAction:

                action.shortAction,

            gapDays:

                Number(
                    prediction.gapDays ||
                    0
                ),

            autonomy:

                Number(
                    prediction.autonomy ||
                    0
                ),

            etaDays:

                Number(
                    prediction.etaDays ||
                    shipment?.etaDays ||
                    0
                )

        };

    },


    /*
     * -----------------------------------------
     * CHECK LOGISTICS PANEL
     * -----------------------------------------
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
     * -----------------------------------------
     * RENDER RECOMMENDATION SECTION
     * -----------------------------------------
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
         * Remove previous version.
         */

        const existing =
            document.getElementById(
                "resupplyRecommendationSection"
            );


        if (existing) {

            existing.remove();

        }


        const recommendation =
            this.generateRecommendation();


        if (!recommendation) {

            return;

        }


        const isSafe =
            recommendation.level ===
            "SAFE";


        const section =
            document.createElement(
                "div"
            );


        section.id =
            "resupplyRecommendationSection";


        section.className =
            "resupply-recommendation-section";


        section.innerHTML = `

            <div class="recommendation-header">

                <div>

                    <div class="recommendation-eyebrow">
                        DECISION SUPPORT
                    </div>

                    <h3>
                        Resupply Recommendation
                    </h3>

                    <p>
                        Recommended action based on
                        current resource autonomy,
                        shipment timing and risk.
                    </p>

                </div>


                <div
                    class="
                        recommendation-status
                        ${recommendation.level.toLowerCase()}
                    "
                >

                    ${
                        isSafe
                            ? "✓"
                            : "!"
                    }

                    ${
                        isSafe
                            ? "SAFE"
                            : recommendation.priority
                    }

                </div>

            </div>


            <div class="recommendation-main">

                <div class="recommendation-icon">

                    ${
                        isSafe
                            ? "✓"
                            : "!"
                    }

                </div>


                <div>

                    <span>
                        RECOMMENDED ACTION
                    </span>

                    <strong>
                        ${recommendation.title}
                    </strong>

                    <p>
                        ${recommendation.action}
                    </p>

                </div>

            </div>


            ${
                !isSafe
                    ? `

                    <div class="recommendation-details">


                        <div class="recommendation-detail">

                            <span>
                                RESOURCE
                            </span>

                            <strong>
                                ${recommendation.resource}
                            </strong>

                        </div>


                        <div class="recommendation-detail">

                            <span>
                                RECOMMENDED QUANTITY
                            </span>

                            <strong>

                                ${
                                    recommendation.quantity > 0

                                        ? recommendation.quantity
                                            .toLocaleString(
                                                "en-IN"
                                            )

                                        : "--"
                                }

                                ${recommendation.unit}

                            </strong>

                        </div>


                        <div class="recommendation-detail">

                            <span>
                                PRIORITY
                            </span>

                            <strong>
                                ${recommendation.priority}
                            </strong>

                        </div>


                        <div class="recommendation-detail">

                            <span>
                                SUPPLY GAP
                            </span>

                            <strong>

                                ${
                                    recommendation.gapDays > 0

                                        ? Math.ceil(
                                            recommendation.gapDays
                                        ) +
                                        " days"

                                        : "NONE"
                                }

                            </strong>

                        </div>


                    </div>

                    `
                    : `

                    <div class="recommendation-safe">

                        <span class="recommendation-safe-icon">
                            ✓
                        </span>

                        <div>

                            <strong>
                                NO EMERGENCY ACTION
                            </strong>

                            <p>
                                Current logistics conditions
                                remain within the operational
                                safety margin.
                            </p>

                        </div>

                    </div>

                    `
            }


            <div class="recommendation-basis">

                <span>
                    DECISION BASIS
                </span>

                ${
                    recommendation.autonomy > 0

                        ? `
                            ${Math.round(
                                recommendation.autonomy
                            )} days resource autonomy

                            ${
                                recommendation.etaDays > 0

                                    ? ` • ${Math.ceil(
                                        recommendation.etaDays
                                    )} days shipment ETA`

                                    : ""
                            }
                        `

                        : `
                            Current logistics state
                        `
                }

            </div>

        `;


        /*
         * Put recommendation near the
         * lower part of the Logistics panel.
         */

        panel.appendChild(
            section
        );


        this.initialized =
            true;

    },


    /*
     * -----------------------------------------
     * UPDATE RECOMMENDATION
     * -----------------------------------------
     */

    update() {

        /*
         * Do not keep adding recommendation
         * sections to hidden dashboards.
         */

        if (
            !this.isLogisticsOpen()
        ) {

            return;

        }


        this.render();


        /*
         * Update Command Status after the
         * recommendation has been recalculated.
         *
         * IMPORTANT:
         * Command does NOT call Recommendation
         * again, so there is no recursion.
         */

        if (
            window.LogisticsCommand &&
            typeof LogisticsCommand.update ===
                "function"
        ) {

            LogisticsCommand.update();

        }

    },


    /*
     * -----------------------------------------
     * INITIALIZE
     * -----------------------------------------
     */

    init() {

        console.log(
            "Resupply recommendation engine initialized."
        );


        /*
         * Only render if Logistics is currently
         * visible.
         */

        if (
            this.isLogisticsOpen()
        ) {

            this.render();

        }


        this.initialized =
            true;

    }

};


/*
 * -----------------------------------------
 * DOM READY
 * -----------------------------------------
 */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        if (
            window.LogisticsRecommendation &&
            typeof LogisticsRecommendation.init ===
                "function"
        ) {

            LogisticsRecommendation.init();

        }

    }
);
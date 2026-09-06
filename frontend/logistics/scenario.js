window.LogisticsScenario = {

    active: false,

    fuelBurnMultiplier: 1.5,

    etaDelayDays: 10,


    init() {

        console.log(
            "Logistics scenario module initialized."
        );

        this.render();

        this.update();

    },


    render() {

        const logisticsPanel =
            document.getElementById(
                "logisticsPanel"
            );

        if (!logisticsPanel) {
            return;
        }


        const existingSection =
            document.getElementById(
                "logisticsScenarioSection"
            );

        if (existingSection) {
            existingSection.remove();
        }


        const section =
            document.createElement("div");

        section.id =
            "logisticsScenarioSection";

        section.className =
            "logistics-module scenario-section";


        section.innerHTML = `

            <div class="scenario-header">

                <div>

                    <h3>
                        What-If Scenario
                    </h3>

                    <p>
                        Simulate operational impact of severe
                        Antarctic weather on logistics.
                    </p>

                </div>

            </div>


            <div class="scenario-controls">

                <button
                    id="severeWeatherScenarioBtn"
                    class="scenario-button"
                    type="button"
                >
                    Simulate Severe Weather
                </button>


                <button
                    id="resetScenarioBtn"
                    class="scenario-button secondary"
                    type="button"
                >
                    Reset
                </button>

            </div>


            <div
                id="scenarioStatus"
                class="scenario-status"
            >
                Normal operating conditions
            </div>

        `;


        logisticsPanel.appendChild(
            section
        );


        const severeWeatherButton =
            document.getElementById(
                "severeWeatherScenarioBtn"
            );

        const resetButton =
            document.getElementById(
                "resetScenarioBtn"
            );


        if (severeWeatherButton) {

            severeWeatherButton.addEventListener(
                "click",
                () => {

                    this.activateSevereWeather();

                }
            );

        }


        if (resetButton) {

            resetButton.addEventListener(
                "click",
                () => {

                    this.reset();

                }
            );

        }

    },


    update() {

        const status =
            document.getElementById(
                "scenarioStatus"
            );

        const severeWeatherButton =
            document.getElementById(
                "severeWeatherScenarioBtn"
            );


        if (!status) {
            return;
        }


        if (this.active) {

            status.textContent =
                "SEVERE WEATHER SCENARIO ACTIVE — " +
                "fuel consumption increased and resupply delayed.";

            status.classList.add(
                "active"
            );


            if (severeWeatherButton) {

                severeWeatherButton.disabled =
                    true;

            }

        } else {

            status.textContent =
                "Normal operating conditions";

            status.classList.remove(
                "active"
            );


            if (severeWeatherButton) {

                severeWeatherButton.disabled =
                    false;

            }

        }

    },


    activateSevereWeather() {

        this.active = true;


        this.applyScenarioEffects();


        this.update();


        this.refreshModules();

    },


    reset() {

        this.active = false;


        this.removeScenarioEffects();


        this.update();


        this.refreshModules();

    },


    applyScenarioEffects() {

        /*
         * Increase fuel consumption through the
         * scenario multiplier.
         *
         * The prediction and logistics modules
         * read this multiplier automatically.
         */


        /*
         * Add additional delay to the active
         * resupply shipment.
         */

        if (
            window.LogisticsTracking &&
            Array.isArray(
                LogisticsTracking.shipments
            )
        ) {

            const shipment =
                LogisticsTracking.shipments.find(
                    item =>
                        item.id === "SUP-001"
                );


            if (shipment) {

                /*
                 * Store original values only once.
                 */

                if (
                    typeof shipment.originalEtaDays ===
                    "undefined"
                ) {

                    shipment.originalEtaDays =
                        shipment.etaDays;

                    shipment.originalRisk =
                        shipment.risk;

                    shipment.originalCondition =
                        shipment.condition;

                }


                shipment.etaDays =
                    Math.max(
                        shipment.etaDays,
                        shipment.originalEtaDays
                    ) + this.etaDelayDays;


                shipment.risk =
                    "HIGH";


                shipment.condition =
                    "SEVERE";

            }

        }

    },


    removeScenarioEffects() {

        if (
            window.LogisticsTracking &&
            Array.isArray(
                LogisticsTracking.shipments
            )
        ) {

            const shipment =
                LogisticsTracking.shipments.find(
                    item =>
                        item.id === "SUP-001"
                );


            if (shipment) {

                /*
                 * Restore original shipment values.
                 */

                if (
                    typeof shipment.originalEtaDays !==
                    "undefined"
                ) {

                    shipment.etaDays =
                        shipment.originalEtaDays;

                    shipment.risk =
                        shipment.originalRisk;

                    shipment.condition =
                        shipment.originalCondition;

                }

            }

        }

    },


    getFuelAutonomyMultiplier() {

        if (this.active) {

            return this.fuelBurnMultiplier;

        }

        return 1;

    },


    refreshModules() {

        /*
         * 1. Refresh shipment tracking
         */

        if (
            window.LogisticsTracking &&
            typeof LogisticsTracking.update ===
                "function"
        ) {

            LogisticsTracking.update();

        }


        /*
         * 2. Refresh supply-gap prediction
         */

        if (
            window.LogisticsPrediction &&
            typeof LogisticsPrediction.update ===
                "function"
        ) {

            LogisticsPrediction.update();

        }


        /*
         * 3. Refresh logistics resource calculations
         */

        if (
            window.LogisticsModule &&
            typeof LogisticsModule.update ===
                "function"
        ) {

            LogisticsModule.update();

        }


        /*
         * 4. Refresh transport optimizer
         *
         * This is the new Phase 4A integration.
         */

        if (
            window.LogisticsTransport &&
            typeof LogisticsTransport.update ===
                "function"
        ) {

            LogisticsTransport.update();

        }
        if (
    window.LogisticsRoute &&
    typeof LogisticsRoute.update ===
        "function"
) {

    LogisticsRoute.update();

}

    }

};


/*
 * Initialize the scenario module after
 * the page has finished loading.
 */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        if (
            window.LogisticsScenario &&
            typeof LogisticsScenario.init ===
                "function"
        ) {

            LogisticsScenario.init();

        }

    }
);
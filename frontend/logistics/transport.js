window.LogisticsTransport = {

    transportOptions: [

        {
            id: "vessel",
            name: "Supply Vessel",
            icon: "🚢",
            baseEta: 14,
            capacity: "HIGH",
            capacityScore: 100,
            baseCost: 30,
            weatherSensitivity: 0.35,
            suitableResources: [
                "fuel",
                "food",
                "water",
                "medical"
            ]
        },

        {
            id: "aircraft",
            name: "Aircraft",
            icon: "✈",
            baseEta: 5,
            capacity: "MEDIUM",
            capacityScore: 70,
            baseCost: 65,
            weatherSensitivity: 0.20,
            suitableResources: [
                "fuel",
                "food",
                "water",
                "medical"
            ]
        },

        {
            id: "helicopter",
            name: "Helicopter",
            icon: "🚁",
            baseEta: 2,
            capacity: "LOW",
            capacityScore: 35,
            baseCost: 90,
            weatherSensitivity: 0.45,
            suitableResources: [
                "fuel",
                "food",
                "water",
                "medical"
            ]
        }

    ],


    getWeatherFactor() {

        let temperature = -18;
        let wind = 8;

        const temperatureElement =
            document.getElementById("liveTemperature");

        const windElement =
            document.getElementById("liveWind");


        if (temperatureElement) {

            const parsedTemperature =
                parseFloat(
                    temperatureElement.textContent
                );

            if (!Number.isNaN(parsedTemperature)) {
                temperature = parsedTemperature;
            }
        }


        if (windElement) {

            const parsedWind =
                parseFloat(
                    windElement.textContent
                );

            if (!Number.isNaN(parsedWind)) {
                wind = parsedWind;
            }
        }


        let factor = 1;


        if (wind >= 25) {

            factor *= 0.55;

        } else if (wind >= 18) {

            factor *= 0.75;
        }


        if (temperature <= -35) {

            factor *= 0.65;

        } else if (temperature <= -25) {

            factor *= 0.85;
        }


        return Math.max(0.35, factor);
    },


    getResourceType() {

        if (
            window.LogisticsModule &&
            typeof LogisticsModule.getResourceData === "function"
        ) {

            const resource =
                LogisticsModule.getResourceData();

            if (resource && resource.type) {
                return resource.type;
            }
        }

        return "fuel";
    },


    getPrediction() {

        if (
            window.LogisticsPrediction &&
            typeof LogisticsPrediction.calculate === "function"
        ) {

            return LogisticsPrediction.calculate();
        }

        return null;
    },


    calculateOptionScore(option) {

        const prediction =
            this.getPrediction();

        const resourceType =
            this.getResourceType();

        const weatherFactor =
            this.getWeatherFactor();


        let score = 0;


        /*
         * ETA suitability
         */

        const etaScore =
            Math.max(
                0,
                100 - (option.baseEta * 4)
            );

        score += etaScore * 0.30;


        /*
         * Cargo capacity
         */

        score += option.capacityScore * 0.20;


        /*
         * Weather suitability
         */

        const weatherScore =
            weatherFactor >= 0.85
                ? 100
                : weatherFactor >= 0.60
                    ? 70
                    : 40;


        const weatherAdjustedScore =
            weatherScore *
            (1 - option.weatherSensitivity * 0.5);


        score += weatherAdjustedScore * 0.20;


        /*
         * Resource suitability
         */

        if (
            option.suitableResources.includes(
                resourceType
            )
        ) {

            score += 100 * 0.10;
        }


        /*
         * Supply urgency
         */

        if (prediction) {

            if (prediction.level === "CRITICAL") {

                const urgencyScore =
                    Math.max(
                        0,
                        100 - option.baseEta * 10
                    );

                score += urgencyScore * 0.20;

            } else if (
                prediction.level === "HIGH"
            ) {

                const urgencyScore =
                    Math.max(
                        0,
                        100 - option.baseEta * 7
                    );

                score += urgencyScore * 0.20;

            } else {

                const economyScore =
                    100 - option.baseCost;

                score += economyScore * 0.20;
            }
        }


        return Math.round(
            Math.max(
                0,
                Math.min(100, score)
            )
        );
    },


    getOptions() {

        return this.transportOptions.map(
            option => {

                return {

                    ...option,

                    score:
                        this.calculateOptionScore(
                            option
                        )

                };

            }
        );
    },


    getRecommendedOption() {

        const options =
            this.getOptions();

        if (!options.length) {
            return null;
        }


        options.sort(
            (a, b) =>
                b.score - a.score
        );


        return options[0];
    },


    getRecommendationReason(option) {

        if (!option) {
            return "No suitable transport option available.";
        }


        const prediction =
            this.getPrediction();

        const weatherFactor =
            this.getWeatherFactor();


        if (
            prediction &&
            prediction.level === "CRITICAL"
        ) {

            return (
                `${option.name} provides the fastest available ` +
                `response for the current critical supply window.`
            );
        }


        if (
            prediction &&
            prediction.level === "HIGH"
        ) {

            return (
                `${option.name} provides a suitable balance ` +
                `between delivery time and operational reliability.`
            );
        }


        if (weatherFactor < 0.60) {

            return (
                `${option.name} currently offers the best ` +
                `available transport suitability under severe weather.`
            );
        }


        if (option.id === "vessel") {

            return (
                "High cargo capacity makes the vessel suitable " +
                "for planned bulk resupply operations."
            );
        }


        if (option.id === "aircraft") {

            return (
                "Aircraft provides a faster delivery window " +
                "while retaining useful cargo capacity."
            );
        }


        return (
            "Helicopter provides the fastest response for " +
            "small and urgent deliveries."
        );
    },


    calculate() {

        const options =
            this.getOptions();

        const recommended =
            this.getRecommendedOption();

        if (!recommended) {
            return null;
        }


        return {

            options,

            recommended,

            reason:
                this.getRecommendationReason(
                    recommended
                ),

            weatherFactor:
                this.getWeatherFactor(),

            resourceType:
                this.getResourceType()
        };
    },


    render() {

        const logisticsPanel =
            document.getElementById(
                "logisticsPanel"
            );

        if (!logisticsPanel) {
            return;
        }


        const oldSection =
            document.getElementById(
                "transportOptimizerSection"
            );

        if (oldSection) {
            oldSection.remove();
        }


        const result =
            this.calculate();

        if (!result) {
            return;
        }


        const section =
            document.createElement("div");

        section.id =
            "transportOptimizerSection";

        section.className =
            "logistics-module transport-section";


        const recommended =
            result.recommended;


        const weatherPercent =
            Math.round(
                result.weatherFactor * 100
            );


        section.innerHTML = `

            <div class="transport-header">

                <div>

                    <h3>
                        Transport Option Optimizer
                    </h3>

                    <p>
                        Compares available transport modes
                        against the current supply situation.
                    </p>

                </div>

            </div>


            <div class="transport-recommended">

                <div class="transport-recommended-label">
                    RECOMMENDED TRANSPORT
                </div>


                <div class="transport-recommended-main">

                    <span class="transport-main-icon">
                        ${recommended.icon}
                    </span>


                    <div>

                        <strong>
                            ${recommended.name}
                        </strong>

                        <span>
                            Optimizer Score:
                            ${recommended.score}/100
                        </span>

                    </div>

                </div>


                <div class="transport-reason">

                    ${result.reason}

                </div>

            </div>


            <div class="transport-weather">

                <span>
                    Weather suitability
                </span>

                <strong>
                    ${weatherPercent}%
                </strong>

            </div>


            <div class="transport-options">

                ${result.options.map(option => `

                    <div class="
                        transport-option
                        ${option.id === recommended.id
                            ? "recommended"
                            : ""}
                    ">

                        <div class="transport-option-title">

                            <span>
                                ${option.icon}
                            </span>

                            <strong>
                                ${option.name}
                            </strong>

                            ${
                                option.id === recommended.id
                                    ? `<small>BEST MATCH</small>`
                                    : ""
                            }

                        </div>


                        <div class="transport-option-details">

                            <div>

                                <span>
                                    ETA
                                </span>

                                <strong>
                                    ${option.baseEta} days
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Capacity
                                </span>

                                <strong>
                                    ${option.capacity}
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Score
                                </span>

                                <strong>
                                    ${option.score}
                                </strong>

                            </div>

                        </div>

                    </div>

                `).join("")}

            </div>

        `;


        logisticsPanel.appendChild(
            section
        );
    },


    init() {

        console.log(
            "Logistics Transport Optimizer initialized."
        );

        this.render();

    },


    update() {

        this.render();

    }

};


/*
 * Initialize after the page has loaded.
 */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        if (
            window.LogisticsTransport &&
            typeof LogisticsTransport.init === "function"
        ) {

            LogisticsTransport.init();

        }

    }
);
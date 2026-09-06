// ============================================================
// LOGISTICS MODULE
// Phase 1A - Resource & Autonomy Engine
// ============================================================

window.LogisticsModule = {

    panel: null,

    // --------------------------------------------------------
    // RESOURCE CONFIGURATION
    // --------------------------------------------------------

    resources: {

        fuel: {
            name: "Fuel",
            unit: "L",
            defaultStock: 10000,
            defaultDailyUse: 350
        },

        food: {
            name: "Food",
            unit: "kg",
            defaultStock: 3000,
            defaultDailyUse: 99
        },

        water: {
            name: "Water",
            unit: "L",
            defaultStock: 6000,
            defaultDailyUse: 150
        },

        medical: {
            name: "Medical",
            unit: "units",
            defaultStock: 500,
            defaultDailyUse: 0.9
        }

    },

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------

    init() {

        console.log("Logistics module initialized.");

        this.panel =
            document.getElementById("logisticsPanel");

        if (!this.panel) {

            console.error(
                "Logistics panel not found."
            );

            return;
        }

        console.log(
            "Logistics panel connected successfully."
        );

        this.bindEvents();

        this.update();
        if (
    window.LogisticsTracking &&
    typeof window.LogisticsTracking.update === "function"
) {

    window.LogisticsTracking.update();

}
    },

    // --------------------------------------------------------
    // EVENT LISTENERS
    // --------------------------------------------------------

    bindEvents() {

        const resourceSelector =
            document.getElementById("resourceType");

        if (resourceSelector) {

            resourceSelector.addEventListener(
    "change",
    () => {

        console.log(
            "Resource changed:",
            resourceSelector.value
        );

        this.update();

        if (
            window.LogisticsPrediction &&
            typeof window.LogisticsPrediction.update ===
                "function"
        ) {

            window.LogisticsPrediction.update();

        }

    }
);
        }

    },

    // --------------------------------------------------------
    // GET CURRENT RESOURCE
    // --------------------------------------------------------

    getCurrentResource() {

        const selector =
            document.getElementById("resourceType");

        const resourceType =
            selector?.value || "fuel";

        return {
            type: resourceType,
            ...(
                this.resources[resourceType]
                || this.resources.fuel
            )
        };

    },

    // --------------------------------------------------------
    // GET RESOURCE DATA
    // --------------------------------------------------------

    getResourceData() {

        const resource =
            this.getCurrentResource();

        let stock =
            resource.defaultStock;

        let dailyUse =
            resource.defaultDailyUse;

        // --------------------------------------------
        // FUEL
        // Use the existing simulation if available.
        // --------------------------------------------

        if (
            resource.type === "fuel" &&
            typeof latestSimulation !== "undefined" &&
            latestSimulation
        ) {

            if (
                Number.isFinite(
                    Number(latestSimulation.projectedFuelStock)
                )
            ) {

                stock =
                    Number(
                        latestSimulation.projectedFuelStock
                    );

            }

            if (
                Number.isFinite(
                    Number(latestSimulation.dailyFuelUse)
                )
            ) {

                dailyUse =
                    Number(
                        latestSimulation.dailyFuelUse
                    );

            }

        }

        // --------------------------------------------
        // OTHER RESOURCES
        // --------------------------------------------

        if (resource.type === "food") {

            const foodStock =
                document.getElementById("foodStock");

            if (foodStock) {

                const value =
                    Number(foodStock.value);

                if (Number.isFinite(value)) {

                    stock = value;

                }

            }

            const personnel =
                Number(
                    document.getElementById(
                        "personnel"
                    )?.value || 45
                );

            dailyUse =
                personnel * 2.2;

        }

        if (resource.type === "water") {

            const waterStock =
                document.getElementById("waterStock");

            if (waterStock) {

                const value =
                    Number(waterStock.value);

                if (Number.isFinite(value)) {

                    stock = value;

                }

            }

            dailyUse = 150;

        }

        if (resource.type === "medical") {

            const medicalStock =
                document.getElementById("medicalStock");

            if (medicalStock) {

                const value =
                    Number(medicalStock.value);

                if (Number.isFinite(value)) {

                    stock = value;

                }

            }

            const personnel =
                Number(
                    document.getElementById(
                        "personnel"
                    )?.value || 45
                );

            dailyUse =
                personnel * 0.02;

        }

        // --------------------------------------------
        // INFRASTRUCTURE EFFECT
        // --------------------------------------------

        if (
            resource.type === "water" &&
            typeof getInfrastructureSimulationImpact ===
                "function"
        ) {

            const infrastructure =
                getInfrastructureSimulationImpact();

            if (infrastructure) {

                const additionalCapacity =
                    Number(
                        infrastructure.waterCapacity || 0
                    );

                stock +=
                    additionalCapacity;

                dailyUse =
                    Math.max(
                        1,
                        dailyUse -
                        additionalCapacity * 0.01
                    );

            }

        }

        return {

            type: resource.type,

            name: resource.name,

            unit: resource.unit,

            stock: Math.max(0, stock),

            dailyUse: Math.max(0, dailyUse)

        };

    },

    // --------------------------------------------------------
    // CALCULATE AUTONOMY
    // --------------------------------------------------------

    calculateAutonomy(stock, dailyUse) {

        if (
            !Number.isFinite(stock) ||
            !Number.isFinite(dailyUse) ||
            dailyUse <= 0
        ) {

            return 0;

        }

        return stock / dailyUse;

    },

    // --------------------------------------------------------
    // CALCULATE DEPLETION DATE
    // --------------------------------------------------------

    calculateDepletionDate(days) {

        const startDate =
            document.getElementById(
                "startDate"
            )?.value;

        if (!startDate) {

            return "--";

        }

        const date =
            new Date(startDate);

        date.setDate(
            date.getDate() +
            Math.floor(days)
        );

        return date
            .toISOString()
            .split("T")[0];

    },

    // --------------------------------------------------------
    // CALCULATE TRANSPORT AVAILABILITY
    // --------------------------------------------------------

    calculateTransportAvailability() {

        let transport = 100;

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

        // Use existing simulation result when available.

        if (
            typeof latestSimulation !== "undefined" &&
            latestSimulation &&
            Number.isFinite(
                Number(
                    latestSimulation.minimumTransport
                )
            )
        ) {

            transport =
                Number(
                    latestSimulation.minimumTransport
                );

        }
        else {

            const currentWind =
                Number.isFinite(wind)
                    ? wind
                    : 8;

            const currentTemperature =
                Number.isFinite(temperature)
                    ? temperature
                    : -18;

            if (currentWind >= 25) {

                transport -= 25;

            }
            else if (currentWind >= 18) {

                transport -= 15;

            }

            if (currentTemperature <= -35) {

                transport -= 25;

            }
            else if (currentTemperature <= -25) {

                transport -= 15;

            }

        }

        return Math.max(
            0,
            Math.min(
                100,
                transport
            )
        );

    },

    // --------------------------------------------------------
    // CALCULATE SIMULATION PERIOD
    // --------------------------------------------------------

    getSimulationDays() {

        const startDate =
            document.getElementById(
                "startDate"
            )?.value;

        const endDate =
            document.getElementById(
                "endDate"
            )?.value;

        if (!startDate || !endDate) {

            return 30;

        }

        const start =
            new Date(startDate);

        const end =
            new Date(endDate);

        const difference =
            end - start;

        return Math.max(
            1,
            Math.ceil(
                difference /
                (1000 * 60 * 60 * 24)
            ) + 1
        );

    },

    // --------------------------------------------------------
    // CALCULATE LOGISTICS RISK
    // --------------------------------------------------------

    calculateRisk(
        transport,
        autonomy,
        simulationDays
    ) {

        const requiredResupply =
            autonomy < simulationDays;

        let risk = "LOW";

        if (
            transport < 70 ||
            requiredResupply
        ) {

            risk = "MEDIUM";

        }

        if (
            transport < 40 ||
            autonomy < 7
        ) {

            risk = "HIGH";

        }

        if (
            transport < 20 ||
            autonomy < 2
        ) {

            risk = "CRITICAL";

        }

        return {

            risk,
            requiredResupply

        };

    },

    // --------------------------------------------------------
    // UPDATE DASHBOARD
    // --------------------------------------------------------

    update() {

        const data =
            this.getResourceData();

        const autonomy =
            this.calculateAutonomy(
                data.stock,
                data.dailyUse
            );

        const depletionDate =
            this.calculateDepletionDate(
                autonomy
            );

        const transport =
            this.calculateTransportAvailability();

        const simulationDays =
            this.getSimulationDays();

        const riskData =
            this.calculateRisk(
                transport,
                autonomy,
                simulationDays
            );

        console.log(
            "LOGISTICS DATA",
            {
                resource: data.name,
                stock: data.stock,
                dailyUse: data.dailyUse,
                autonomy: autonomy,
                depletionDate: depletionDate,
                transport: transport,
                risk: riskData.risk
            }
        );

        this.updateUI(
            data,
            autonomy,
            depletionDate,
            transport,
            riskData,
            simulationDays
        );

    },

    // --------------------------------------------------------
    // UPDATE EXISTING HTML
    // --------------------------------------------------------

    updateUI(
        data,
        autonomy,
        depletionDate,
        transport,
        riskData,
        simulationDays
    ) {

        const stockElement =
            document.getElementById(
                "resourceStock"
            );

        const dailyUseElement =
            document.getElementById(
                "resourceDailyUse"
            );

        const daysElement =
            document.getElementById(
                "resourceDays"
            );

        const depletionElement =
            document.getElementById(
                "resourceDepletion"
            );

        const transportBar =
            document.getElementById(
                "transportProgress"
            );

        const transportValue =
            document.getElementById(
                "transportValue"
            );

        const riskElement =
            document.getElementById(
                "logisticsRisk"
            );

        const statusElement =
            document.getElementById(
                "resupplyStatus"
            );

        const messageElement =
            document.getElementById(
                "resupplyMessage"
            );

        // --------------------------------------------
        // RESOURCE STATUS
        // --------------------------------------------

        if (stockElement) {

            stockElement.textContent =
                data.stock.toLocaleString(
                    "en-IN",
                    {
                        maximumFractionDigits: 1
                    }
                ) +
                " " +
                data.unit;

        }

        if (dailyUseElement) {

            dailyUseElement.textContent =
                data.dailyUse.toLocaleString(
                    "en-IN",
                    {
                        maximumFractionDigits: 1
                    }
                ) +
                " " +
                data.unit +
                "/day";

        }

        if (daysElement) {

            daysElement.textContent =
                Math.floor(autonomy) +
                " days";

        }

        if (depletionElement) {

            depletionElement.textContent =
                depletionDate;

        }

        // --------------------------------------------
        // TRANSPORT
        // --------------------------------------------

        if (transportBar) {

            transportBar.style.width =
                `${transport}%`;

        }

        if (transportValue) {

            transportValue.textContent =
                `${Math.round(transport)}%`;

        }

        // --------------------------------------------
        // RISK
        // --------------------------------------------

        if (riskElement) {

            riskElement.textContent =
                riskData.risk;

        }

        // --------------------------------------------
        // RESUPPLY
        // --------------------------------------------

        if (statusElement) {

            statusElement.textContent =
                riskData.requiredResupply
                    ? "Resupply Required"
                    : "Resupply Not Required";

        }

        if (messageElement) {

            messageElement.textContent =
                riskData.requiredResupply

                    ? `${data.name} will be depleted before the ${simulationDays}-day simulation ends.`

                    : `Current ${data.name} stock is sufficient for the ${simulationDays}-day simulation period.`;

        }

    }

};


// ============================================================
// START LOGISTICS MODULE
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        window.LogisticsModule.init();

    }
);
window.LogisticsPrediction = {

    calculate() {

        if (
            !window.LogisticsModule ||
            typeof window.LogisticsModule.getResourceData !== "function"
        ) {
            return null;
        }

        const resource = LogisticsModule.getResourceData();

        if (!resource) {
            return null;
        }

        const resourceType = resource.type;
        let dailyUse = Number(resource.dailyUse);
        const stock = Number(resource.stock);

        // Apply scenario effect to fuel consumption
        if (
            resourceType === "fuel" &&
            window.LogisticsScenario &&
            typeof window.LogisticsScenario.getFuelAutonomyMultiplier === "function"
        ) {

            const multiplier =
                LogisticsScenario.getFuelAutonomyMultiplier();

            dailyUse = dailyUse * multiplier;
        }

        // Calculate autonomy
        let autonomy = 0;

        if (dailyUse > 0) {
            autonomy = stock / dailyUse;
        }

        // Get active shipment
        let cargo = null;

        if (
            window.LogisticsTracking &&
            typeof LogisticsTracking.getActiveShipment === "function"
        ) {
            cargo = LogisticsTracking.getActiveShipment();
        }

        if (!cargo) {
            return {
                resource,
                autonomy,
                cargo: null
            };
        }

        const etaDays = Number(cargo.etaDays);

        // Difference between resource autonomy and shipment ETA
        const margin = autonomy - etaDays;

        // How many days the station may be without the resource
        const gapDays = Math.max(0, etaDays - autonomy);

        const hasGap = gapDays > 0;

        // Determine prediction level
        let level = "SAFE";

        if (margin < 0) {

            level = "CRITICAL";

        } else if (
            margin <= 3 ||
            cargo.risk === "HIGH"
        ) {

            level = "HIGH";

        } else if (
            margin <= 7 ||
            cargo.risk === "MEDIUM"
        ) {

            level = "MEDIUM";

        }

        return {
            resource,
            cargo,
            autonomy,
            etaDays,
            margin,
            gapDays,
            hasGap,
            level
        };
    },


    update() {

        const result = this.calculate();

        if (!result) {
            return;
        }

        if (!result.cargo) {
            return;
        }

        const existingSection =
            document.getElementById(
                "supplyGapPredictionSection"
            );

        if (existingSection) {
            existingSection.remove();
        }

        const section =
            document.createElement("div");

        section.id =
            "supplyGapPredictionSection";

        section.className =
            "logistics-module prediction-section";

        const card =
            document.createElement("div");

        card.className =
            "prediction-card";

        const level =
            result.level;

        let message = "";

        if (result.hasGap) {

            message =
                `${result.resource.name} may be depleted approximately ` +
                `${Math.ceil(result.gapDays)} days before ` +
                `${result.cargo.id} arrives.`;

        } else {

            message =
                `${result.resource.name} is expected to remain available ` +
                `until the current resupply shipment arrives.`;
        }

        let statusText = "";

        if (level === "CRITICAL") {

            statusText = "CRITICAL SUPPLY GAP";

        } else if (level === "HIGH") {

            statusText = "HIGH SUPPLY RISK";

        } else if (level === "MEDIUM") {

            statusText = "MEDIUM SUPPLY RISK";

        } else {

            statusText = "SUPPLY WINDOW SAFE";
        }

        card.innerHTML = `

            <div class="prediction-status ${level.toLowerCase()}">
                ${statusText}
            </div>

            <div class="prediction-header">
                <div>
                    <h3>Supply Gap Prediction</h3>

                    <p>
                        Predictive comparison between current resource
                        autonomy and incoming resupply ETA.
                    </p>
                </div>
            </div>

            <div class="prediction-grid">

                <div class="prediction-metric">

                    <span class="prediction-label">
                        Resource
                    </span>

                    <strong>
                        ${result.resource.name}
                    </strong>

                </div>


                <div class="prediction-metric">

                    <span class="prediction-label">
                        Autonomy
                    </span>

                    <strong>
                        ${Math.floor(result.autonomy)} days
                    </strong>

                </div>


                <div class="prediction-metric">

                    <span class="prediction-label">
                        Shipment ETA
                    </span>

                    <strong>
                        ${Math.ceil(result.etaDays)} days
                    </strong>

                </div>


                <div class="prediction-metric">

                    <span class="prediction-label">
                        Safety Margin
                    </span>

                    <strong>
                        ${Math.floor(result.margin)} days
                    </strong>

                </div>

            </div>


            <div class="prediction-message">

                ${message}

            </div>

        `;


        section.appendChild(card);


        const logisticsPanel =
            document.getElementById("logisticsPanel");

        if (logisticsPanel) {

            logisticsPanel.appendChild(section);

        }


        // Update the recommendation engine
        if (
            window.LogisticsRecommendation &&
            typeof window.LogisticsRecommendation.update ===
                "function"
        ) {

            window.LogisticsRecommendation.update();

        }

    }

};
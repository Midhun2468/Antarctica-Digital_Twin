window.LogisticsRoute = {

    /*
     * Logistics route layers added to the EXISTING
     * main Leaflet map.
     *
     * We do not create another map.
     */

    mapLayers: [],

    routeLine: null,

    shipmentMarker: null,

    mapReady: false,


    /*
     * Simulated operational logistics routes.
     *
     * These are prototype routes for the Digital Twin.
     */

    routes: [

        {
            id: "MAITRI-SUPPLY",

            station: "Maitri Station",

            origin: "Goa, India",

            destination: "Maitri Station",

            mode: "Supply Vessel",

            shipmentId: "SUP-001",

            status: "IN TRANSIT",

            progress: 68,

            etaDays: 12,

            waypoints: [

                {
                    name: "Goa",
                    lat: 15.49,
                    lng: 73.83
                },

                {
                    name: "Southern Ocean",
                    lat: -40.00,
                    lng: 35.00
                },

                {
                    name: "Antarctic Approach",
                    lat: -60.00,
                    lng: 15.00
                },

                {
                    name: "Maitri Station",
                    lat: -70.76,
                    lng: 11.73
                }

            ]

        },


        {
            id: "BHARATI-SUPPLY",

            station: "Bharati Station",

            origin: "Cape Town, South Africa",

            destination: "Bharati Station",

            mode: "Aircraft",

            shipmentId: "SUP-002",

            status: "SCHEDULED",

            progress: 0,

            etaDays: 21,

            waypoints: [

                {
                    name: "Cape Town",
                    lat: -33.92,
                    lng: 18.42
                },

                {
                    name: "Southern Ocean",
                    lat: -45.00,
                    lng: 25.00
                },

                {
                    name: "Antarctic Approach",
                    lat: -65.00,
                    lng: 20.00
                },

                {
                    name: "Bharati Station",
                    lat: -69.41,
                    lng: 76.19
                }

            ]

        }

    ],


    /*
     * Check whether Logistics is currently open.
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
     * Access the EXISTING Leaflet map created
     * by script.js.
     */

    getMainMap() {

        try {

            if (
                typeof map !== "undefined" &&
                map &&
                typeof map.addLayer === "function"
            ) {

                return map;

            }

        } catch (error) {

            console.warn(
                "Unable to access main Leaflet map.",
                error
            );

        }


        return null;

    },


    /*
     * Find the shipment currently being tracked.
     */

    getActiveRoute() {

        if (
            window.LogisticsTracking &&
            typeof LogisticsTracking.getActiveShipment ===
                "function"
        ) {

            const shipment =
                LogisticsTracking.getActiveShipment();


            if (shipment) {

                const matchingRoute =
                    this.routes.find(
                        route =>
                            route.shipmentId ===
                            shipment.id
                    );


                if (matchingRoute) {

                    return {

                        ...matchingRoute,

                        status:
                            shipment.status,

                        progress:
                            Number(
                                shipment.progress
                            ),

                        etaDays:
                            Number(
                                shipment.etaDays
                            ),

                        risk:
                            shipment.risk,

                        condition:
                            shipment.condition

                    };

                }

            }

        }


        return this.routes[0];

    },


    /*
     * Keep progress between 0 and 100.
     */

    getRouteProgress(route) {

        if (!route) {
            return 0;
        }


        const progress =
            Number(route.progress);


        return Math.max(
            0,
            Math.min(
                100,
                progress
            )
        );

    },


    /*
     * Calculate the current shipment position
     * along the simulated route.
     */

    getCurrentPosition(route) {

        if (
            !route ||
            !route.waypoints ||
            route.waypoints.length < 2
        ) {

            return null;

        }


        const progress =
            this.getRouteProgress(
                route
            );


        const segments =
            route.waypoints.length - 1;


        const position =
            (progress / 100) * segments;


        const segmentIndex =
            Math.min(
                Math.floor(position),
                segments - 1
            );


        const segmentProgress =
            position - segmentIndex;


        const start =
            route.waypoints[
                segmentIndex
            ];


        const end =
            route.waypoints[
                segmentIndex + 1
            ];


        return {

            lat:
                start.lat +
                (
                    end.lat -
                    start.lat
                ) *
                segmentProgress,

            lng:
                start.lng +
                (
                    end.lng -
                    start.lng
                ) *
                segmentProgress

        };

    },


    /*
     * Determine route risk.
     */

    getRouteRisk(route) {

        if (!route) {
            return "LOW";
        }


        if (route.risk) {

            return route.risk;

        }


        if (
            route.condition ===
            "SEVERE"
        ) {

            return "HIGH";

        }


        return "LOW";

    },


    /*
     * Determine route condition.
     */

    getRouteCondition(route) {

        if (!route) {
            return "NORMAL";
        }


        if (route.condition) {

            return route.condition;

        }


        return "NORMAL";

    },


    /*
     * Determine shipment status.
     */

    calculateRouteStatus(route) {

        if (!route) {
            return "NO DATA";
        }


        const progress =
            this.getRouteProgress(
                route
            );


        if (progress >= 100) {

            return "ARRIVED";

        }


        if (progress <= 0) {

            return "SCHEDULED";

        }


        return "IN TRANSIT";

    },


    /*
     * Calculate complete route state.
     */

    calculate() {

        const route =
            this.getActiveRoute();


        if (!route) {
            return null;
        }


        return {

            route,

            progress:
                this.getRouteProgress(
                    route
                ),

            currentPosition:
                this.getCurrentPosition(
                    route
                ),

            risk:
                this.getRouteRisk(
                    route
                ),

            condition:
                this.getRouteCondition(
                    route
                ),

            status:
                this.calculateRouteStatus(
                    route
                )

        };

    },


    /*
     * Return the correct transport icon.
     *
     * Vessel → 🚢
     * Aircraft → ✈️
     */

    getTransportIcon(route) {

        if (!route) {
            return "🚢";
        }


        const mode =
            String(
                route.mode || ""
            ).toLowerCase();


        if (
            mode.includes("aircraft") ||
            mode.includes("air")
        ) {

            return "✈️";

        }


        if (
            mode.includes("helicopter")
        ) {

            return "🚁";

        }


        return "🚢";

    },


    /*
     * Create a visible transport marker.
     */

    createTransportMarker(
        position,
        route,
        result
    ) {

        if (
            !position ||
            !route
        ) {

            return null;

        }


        const icon =
            this.getTransportIcon(
                route
            );


        const transportIcon =
            L.divIcon({

                className:
                    "logistics-transport-icon",

                html: `
                    <div
                        style="
                            width: 38px;
                            height: 38px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 50%;
                            background: rgba(255,255,255,0.96);
                            border: 2px solid #527f93;
                            box-shadow: 0 2px 7px rgba(0,0,0,0.25);
                            font-size: 21px;
                            line-height: 1;
                        "
                    >
                        ${icon}
                    </div>
                `,

                iconSize: [
                    38,
                    38
                ],

                iconAnchor: [
                    19,
                    19
                ]

            });


        const marker =
            L.marker(
                [
                    position.lat,
                    position.lng
                ],
                {
                    icon:
                        transportIcon,

                    zIndexOffset:
                        1000
                }
            );


        marker.bindTooltip(
            `
                <strong>
                    ${icon}
                    ${route.mode}
                </strong>

                <br>

                Shipment:
                ${route.shipmentId}

                <br>

                Progress:
                ${Math.round(
                    result.progress
                )}%

                <br>

                ETA:
                ${Math.ceil(
                    Number(
                        route.etaDays
                    )
                )} days

                <br>

                Status:
                ${result.status}
            `,
            {
                direction:
                    "top",

                offset:
                    [
                        0,
                        -18
                    ]
            }
        );


        return marker;

    },


    /*
     * Remove ONLY the layers created by
     * LogisticsRoute.
     */

    clearMapLayers() {

        const mainMap =
            this.getMainMap();


        if (!mainMap) {
            return;
        }


        this.mapLayers.forEach(
            layer => {

                try {

                    mainMap.removeLayer(
                        layer
                    );

                } catch (error) {

                    console.warn(
                        "Unable to remove logistics layer.",
                        error
                    );

                }

            }
        );


        this.mapLayers = [];


        this.routeLine = null;

        this.shipmentMarker = null;

        this.mapReady = false;

    },


    /*
     * Draw the route on the existing large map.
     */

    updateMap() {

        /*
         * CRITICAL:
         *
         * Logistics layers are allowed ONLY
         * while Logistics is open.
         */

        if (
            !this.isLogisticsOpen()
        ) {

            this.clearMapLayers();

            return;

        }


        const mainMap =
            this.getMainMap();


        if (!mainMap) {

            return;

        }


        const result =
            this.calculate();


        if (
            !result ||
            !result.route
        ) {

            return;

        }


        const route =
            result.route;


        if (
            !route.waypoints ||
            route.waypoints.length < 2
        ) {

            return;

        }


        /*
         * Remove previous Logistics layers.
         */

        this.clearMapLayers();


        /*
         * Convert waypoints to Leaflet coordinates.
         */

        const coordinates =
            route.waypoints.map(
                waypoint => [

                    waypoint.lat,

                    waypoint.lng

                ]
            );


        /*
         * Draw dashed operational route.
         */

        this.routeLine =
            L.polyline(
                coordinates,
                {
                    weight: 3,

                    opacity: 0.8,

                    dashArray:
                        "8 8"
                }
            ).addTo(
                mainMap
            );


        this.mapLayers.push(
            this.routeLine
        );


        /*
         * Add waypoint markers.
         */

        route.waypoints.forEach(
            (
                waypoint,
                index
            ) => {

                const isDestination =
                    index ===
                    route.waypoints.length - 1;


                const marker =
                    L.circleMarker(
                        [
                            waypoint.lat,
                            waypoint.lng
                        ],
                        {

                            radius:
                                isDestination
                                    ? 7
                                    : 5,

                            weight:
                                2,

                            fillOpacity:
                                0.9

                        }
                    );


                marker.bindTooltip(
                    waypoint.name
                );


                marker.addTo(
                    mainMap
                );


                this.mapLayers.push(
                    marker
                );

            }
        );


        /*
         * Add moving ship / aircraft marker.
         */

        const position =
            result.currentPosition;


        if (position) {

            this.shipmentMarker =
                this.createTransportMarker(
                    position,
                    route,
                    result
                );


            if (
                this.shipmentMarker
            ) {

                this.shipmentMarker.addTo(
                    mainMap
                );


                this.mapLayers.push(
                    this.shipmentMarker
                );

            }

        }


        this.mapReady = true;

    },


    /*
     * Zoom the existing large map so that
     * the complete route is visible.
     */

    fitRouteToMap() {

        /*
         * Never manipulate the map when
         * Logistics is closed.
         */

        if (
            !this.isLogisticsOpen()
        ) {

            return;

        }


        const mainMap =
            this.getMainMap();


        if (!mainMap) {
            return;
        }


        const result =
            this.calculate();


        if (
            !result ||
            !result.route ||
            !result.route.waypoints
        ) {

            return;

        }


        const coordinates =
            result.route.waypoints.map(
                waypoint => [

                    waypoint.lat,

                    waypoint.lng

                ]
            );


        if (
            coordinates.length < 2
        ) {

            return;

        }


        /*
         * Draw the route first.
         */

        this.updateMap();


        /*
         * Then fit the large map around
         * the entire route.
         */

        const bounds =
            L.latLngBounds(
                coordinates
            );


        mainMap.fitBounds(
            bounds,
            {

                padding:
                    [
                        70,
                        70
                    ],

                maxZoom:
                    4

            }
        );


        /*
         * Leaflet sometimes needs one more
         * size recalculation after the panel
         * opens.
         */

        setTimeout(
            () => {

                if (
                    mainMap &&
                    typeof mainMap.invalidateSize ===
                        "function"
                ) {

                    mainMap.invalidateSize(
                        true
                    );

                    mainMap.fitBounds(
                        bounds,
                        {

                            padding:
                                [
                                    70,
                                    70
                                ],

                            maxZoom:
                                4

                        }
                    );

                }

            },
            250
        );

    },


    /*
     * Render the route information in the
     * Logistics side panel.
     *
     * The actual map is the large main map.
     */

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
                "logisticsRouteSection"
            );


        if (existingSection) {

            existingSection.remove();

        }


        const result =
            this.calculate();


        if (!result) {
            return;
        }


        const route =
            result.route;


        const transportIcon =
            this.getTransportIcon(
                route
            );


        const section =
            document.createElement(
                "div"
            );


        section.id =
            "logisticsRouteSection";


        section.className =
            "logistics-module route-section";


        section.innerHTML = `

            <div class="route-header">

                <div>

                    <h3>
                        Logistics Route
                    </h3>

                    <p>
                        Active shipment route
                        displayed on the main map.
                    </p>

                </div>

                <span class="route-simulated-badge">
                    SIMULATED ROUTE
                </span>

            </div>


            <div class="route-summary">

                <div class="route-location">

                    <span>
                        ORIGIN
                    </span>

                    <strong>
                        ${route.origin}
                    </strong>

                </div>


                <div class="route-arrow">
                    →
                </div>


                <div class="route-location">

                    <span>
                        DESTINATION
                    </span>

                    <strong>
                        ${route.destination}
                    </strong>

                </div>

            </div>


            <div class="route-details">

                <div>

                    <span>
                        TRANSPORT
                    </span>

                    <strong>
                        ${transportIcon}
                        ${route.mode}
                    </strong>

                </div>


                <div>

                    <span>
                        STATUS
                    </span>

                    <strong>
                        ${result.status}
                    </strong>

                </div>


                <div>

                    <span>
                        ETA
                    </span>

                    <strong>
                        ${Math.ceil(
                            Number(
                                route.etaDays
                            )
                        )} days
                    </strong>

                </div>


                <div>

                    <span>
                        RISK
                    </span>

                    <strong>
                        ${result.risk}
                    </strong>

                </div>

            </div>


            <div class="route-map-note">

                <span class="route-map-note-dot"></span>

                ${transportIcon}

                Active shipment tracked on
                the main logistics map

            </div>


            <div class="route-progress">

                <div class="route-progress-label">

                    <span>
                        Journey Progress
                    </span>

                    <strong>
                        ${Math.round(
                            result.progress
                        )}%
                    </strong>

                </div>


                <div class="route-progress-track">

                    <div
                        class="route-progress-fill"
                        style="
                            width:
                            ${result.progress}%;
                        "
                    ></div>

                </div>

            </div>


            <div class="route-waypoints">

                ${route.waypoints.map(
                    (
                        waypoint,
                        index
                    ) => `

                    <div class="route-waypoint">

                        <span class="route-waypoint-dot">
                            ${index + 1}
                        </span>

                        <span>
                            ${waypoint.name}
                        </span>

                    </div>

                `
                ).join("")}

            </div>

        `;


        logisticsPanel.appendChild(
            section
        );

    },


    /*
     * Watch the Logistics panel.
     *
     * When another dashboard opens and
     * logisticsPanel receives "hidden",
     * immediately remove our route layers.
     */

    observePanelVisibility() {

        const panel =
            document.getElementById(
                "logisticsPanel"
            );


        if (!panel) {
            return;
        }


        const observer =
            new MutationObserver(
                () => {

                    if (
                        panel.classList.contains(
                            "hidden"
                        )
                    ) {

                        this.clearMapLayers();

                    }

                    else {

                        setTimeout(
                            () => {

                                this.fitRouteToMap();

                            },
                            100
                        );

                    }

                }
            );


        observer.observe(
            panel,
            {
                attributes:
                    true,

                attributeFilter:
                    [
                        "class"
                    ]

            }
        );

    },


    /*
     * Initialize the Logistics Route module.
     */

    init() {

        console.log(
            "Logistics route module initialized."
        );


        this.render();


        this.observePanelVisibility();


        /*
         * Do not draw anything while Logistics
         * is initially closed.
         */

        if (
            this.isLogisticsOpen()
        ) {

            setTimeout(
                () => {

                    this.fitRouteToMap();

                },
                200
            );

        }

    },


    /*
     * Refresh route information and map.
     */

    update() {

        this.render();

        this.updateMap();

    }

};


/*
 * Initialize after DOM is ready.
 */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        if (
            window.LogisticsRoute &&
            typeof LogisticsRoute.init ===
                "function"
        ) {

            LogisticsRoute.init();

        }

    }
);
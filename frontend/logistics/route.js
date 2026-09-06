// ============================================================
// LOGISTICS ROUTE MODULE
// Phase 3 - Multimodal Route Tracking
// ============================================================

window.LogisticsRoute = {

    /*
     * Route layers added to the EXISTING
     * main Leaflet map.
     *
     * We do not create another map.
     */

    mapLayers: [],

    routeLayers: [],

    transportMarkers: [],

    mapReady: false,


    /*
     * Simulated operational logistics routes.
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

            status: "IN TRANSIT",

            progress: 35,

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


    // ========================================================
    // LOGISTICS PANEL CHECK
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
    // MAIN MAP ACCESS
    // ========================================================

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


    // ========================================================
    // GET ALL ACTIVE ROUTES
    // ========================================================

    getActiveRoutes() {

        const activeRoutes = [];


        if (
            window.LogisticsTracking &&
            typeof LogisticsTracking.getActiveShipments ===
                "function"
        ) {

            const activeShipments =
                LogisticsTracking.getActiveShipments();


            activeShipments.forEach(
                shipment => {

                    const matchingRoute =
                        this.routes.find(
                            route =>
                                route.shipmentId ===
                                shipment.id
                        );


                    if (matchingRoute) {

                        activeRoutes.push({

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

                        });

                    }

                }
            );

        }


        return activeRoutes;

    },


    // ========================================================
    // GET PRIMARY ROUTE
    // ========================================================
    //
    // Existing modules such as the Route panel still need
    // one primary route. SUP-001 remains primary.
    // ========================================================

    getActiveRoute() {

        const activeRoutes =
            this.getActiveRoutes();


        if (!activeRoutes.length) {

            return this.routes[0];

        }


        const primary =
            activeRoutes.find(
                route =>
                    route.shipmentId ===
                    "SUP-001"
            );


        return primary ||
            activeRoutes[0];

    },


    // ========================================================
    // GET ROUTE PROGRESS
    // ========================================================

    getRouteProgress(route) {

        if (!route) {
            return 0;
        }


        const progress =
            Number(
                route.progress
            );


        return Math.max(
            0,
            Math.min(
                100,
                progress
            )
        );

    },


    // ========================================================
    // CURRENT POSITION
    // ========================================================

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
            (progress / 100) *
            segments;


        const segmentIndex =
            Math.min(
                Math.floor(position),
                segments - 1
            );


        const segmentProgress =
            position -
            segmentIndex;


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


    // ========================================================
    // ROUTE RISK
    // ========================================================

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


    // ========================================================
    // ROUTE CONDITION
    // ========================================================

    getRouteCondition(route) {

        if (!route) {
            return "NORMAL";
        }


        return route.condition ||
            "NORMAL";

    },


    // ========================================================
    // ROUTE STATUS
    // ========================================================

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


    // ========================================================
    // CALCULATE PRIMARY ROUTE STATE
    // ========================================================

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


    // ========================================================
    // TRANSPORT ICON
    // ========================================================

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


    // ========================================================
    // CREATE TRANSPORT MARKER
    // ========================================================

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

                <br>

                Risk:
                ${result.risk}
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


    // ========================================================
    // CLEAR LOGISTICS MAP LAYERS
    // ========================================================

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


        this.routeLayers = [];

        this.transportMarkers = [];

        this.mapReady = false;

    },


    // ========================================================
    // DRAW ALL ACTIVE ROUTES
    // ========================================================

    updateMap() {

        /*
         * Logistics layers appear ONLY while
         * the Logistics dashboard is open.
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


        const activeRoutes =
            this.getActiveRoutes();


        if (!activeRoutes.length) {

            this.clearMapLayers();

            return;

        }


        /*
         * Remove previous Logistics layers.
         */

        this.clearMapLayers();


        /*
         * Draw EACH active shipment route.
         */

        activeRoutes.forEach(
            route => {

                if (
                    !route.waypoints ||
                    route.waypoints.length < 2
                ) {

                    return;

                }


                // --------------------------------------------
                // ROUTE LINE
                // --------------------------------------------

                const coordinates =
                    route.waypoints.map(
                        waypoint => [

                            waypoint.lat,

                            waypoint.lng

                        ]
                    );


                const routeLine =
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


                this.routeLayers.push(
                    routeLine
                );


                this.mapLayers.push(
                    routeLine
                );


                // --------------------------------------------
                // WAYPOINTS
                // --------------------------------------------

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


                // --------------------------------------------
                // MOVING TRANSPORT
                // --------------------------------------------

                const position =
                    this.getCurrentPosition(
                        route
                    );


                if (!position) {

                    return;

                }


                const result = {

                    progress:
                        this.getRouteProgress(
                            route
                        ),

                    status:
                        this.calculateRouteStatus(
                            route
                        ),

                    risk:
                        this.getRouteRisk(
                            route
                        )

                };


                const transportMarker =
                    this.createTransportMarker(
                        position,
                        route,
                        result
                    );


                if (
                    transportMarker
                ) {

                    transportMarker.addTo(
                        mainMap
                    );


                    this.transportMarkers.push(
                        transportMarker
                    );


                    this.mapLayers.push(
                        transportMarker
                    );

                }

            }
        );


        this.mapReady = true;

    },


    // ========================================================
    // FIT MAP TO ALL ACTIVE ROUTES
    // ========================================================

    fitRouteToMap() {

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


        const activeRoutes =
            this.getActiveRoutes();


        if (!activeRoutes.length) {
            return;
        }


        const allCoordinates = [];


        activeRoutes.forEach(
            route => {

                if (
                    route.waypoints
                ) {

                    route.waypoints.forEach(
                        waypoint => {

                            allCoordinates.push(
                                [
                                    waypoint.lat,
                                    waypoint.lng
                                ]
                            );

                        }
                    );

                }

            }
        );


        if (
            allCoordinates.length < 2
        ) {

            return;

        }


        /*
         * Draw routes first.
         */

        this.updateMap();


        const bounds =
            L.latLngBounds(
                allCoordinates
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


    // ========================================================
    // RENDER PRIMARY ROUTE INFORMATION
    // ========================================================

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
                        Active shipment routes
                        displayed on the main map.
                    </p>

                </div>

                <span class="route-simulated-badge">
                    SIMULATED ROUTES
                </span>

            </div>


            <div class="route-summary">

                <div class="route-location">

                    <span>
                        PRIMARY ROUTE
                    </span>

                    <strong>
                        ${transportIcon}
                        ${route.origin}
                        →
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

                🚢 + ✈️

                Active multimodal shipments
                tracked on the main map

            </div>


            <div class="route-progress">

                <div class="route-progress-label">

                    <span>
                        Primary Journey Progress
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


    // ========================================================
    // PANEL VISIBILITY
    // ========================================================

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


    // ========================================================
    // INITIALIZE
    // ========================================================

    init() {

        console.log(
            "Logistics route module initialized."
        );


        this.render();


        this.observePanelVisibility();


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


    // ========================================================
    // UPDATE
    // ========================================================

    update() {

        this.render();

        this.updateMap();

    }

};


// ============================================================
// START ROUTE MODULE
// ============================================================

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
const CAMPUS_CENTER = [40.4443, -79.9606];
const CAMPUS_ZOOM = 16;
let dropMarkerMode = false;

// Initialize the Leaflet map with UPitt campus
function initializeMap() {
    const map = L.map('map').setView(CAMPUS_CENTER, CAMPUS_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // No specific location markers for now

    window.pittMap = map;
    
    // Click handler retained but drop-mode handled via modal selection now
    map.on('click', function(e) {
        // no-op: placing markers is done through the preset-building modal
    });
}

// Set up event listeners for map controls
function setupEventListeners() {
    const centerButton = document.getElementById('center-campus');
    if (centerButton) {
        centerButton.addEventListener('click', function() {
            if (window.pittMap) {
                window.pittMap.setView(CAMPUS_CENTER, CAMPUS_ZOOM);
            }
        });
    }

    const dropMarkerButton = document.getElementById('drop-marker');
    if (dropMarkerButton) {
        dropMarkerButton.addEventListener('click', function() {
            openPlaceMarkerModal();
        });
    }

    // Toggle 'Show My Location' button behavior
    const toggleLocationButton = document.getElementById('toggle-location');
    if (toggleLocationButton) {
        toggleLocationButton.addEventListener('click', function() {
            // If tracker exists, stop it
            if (window.pittLocationTracker) {
                try {
                    window.pittLocationTracker.stop();
                } catch (e) {
                    console.error('Error stopping location tracker:', e);
                }
                window.pittLocationTracker = null;
                toggleLocationButton.textContent = 'Show My Location';
                toggleLocationButton.classList.remove('btn-danger');
                toggleLocationButton.classList.add('btn-outline-primary');
            } else {
                // Start tracking
                try {
                    window.pittLocationTracker = startTrackingCurrentLocation();
                    toggleLocationButton.textContent = 'Hide My Location';
                    toggleLocationButton.classList.remove('btn-outline-primary');
                    toggleLocationButton.classList.add('btn-danger');
                } catch (e) {
                    console.error('Failed to start location tracking:', e);
                    alert('Could not start location tracking. Check console for details.');
                }
            }
        });
    }

    // Populate building selects and handle pathfinding
    const startSelect = document.getElementById('route-start');
    const endSelect = document.getElementById('route-end');
    const startFilter = document.getElementById('route-start-filter');
    const endFilter = document.getElementById('route-end-filter');
    const findPathButton = document.getElementById('find-path');

    // Hold a reference to the routing control so we can remove it
    let currentRoutingControl = null;
    // Layer group for event markers (so we can toggle them)
    let eventsLayer = L.layerGroup().addTo(window.pittMap);
    let eventsCache = [];

    // Event queue implementation (FIFO) with expiry support
    class QueueNode {
        constructor(value) {
            this.value = value;
            this.next = null;
        }
    }
    class Queue {
        constructor() {
            this.head = null;
            this.tail = null;
            this.length = 0;
        }
        enqueue(value) {
            const node = new QueueNode(value);
            if (!this.head) {
                this.head = node;
                this.tail = node;
            } else {
                this.tail.next = node;
                this.tail = node;
            }
            this.length++;
        }
        dequeue() {
            if (!this.head) return null;
            const val = this.head.value;
            this.head = this.head.next;
            if (!this.head) this.tail = null;
            this.length--;
            return val;
        }
        peek() {
            return this.head ? this.head.value : null;
        }
        toArray() {
            const out = [];
            let cur = this.head;
            while (cur) {
                out.push(cur.value);
                cur = cur.next;
            }
            return out;
        }
    }

    // Map buildingRowId -> Queue of events
    let buildingEventsMap = {};
    // Map event unique key -> Leaflet marker for removal when event expires
    let eventsMarkerMap = {};
    // Default TTL for an event (ms). Assumption: 1 hour. Can be changed by setting window.PittFindEventTTL
    const EVENT_TTL_MS = (window.PittFindEventTTL && Number(window.PittFindEventTTL)) ? Number(window.PittFindEventTTL) : 60 * 60 * 1000;
    // Purger interval (ms)
    const PURGE_INTERVAL_MS = 10 * 1000; // every 10s
    let purgeIntervalId = null;

    // Keep a cached copy of full building list so filtering can be done client-side
    let buildingsCache = [];

    async function loadBuildings() {
        try {
            const res = await fetch('/api/buildings');
            if (!res.ok) throw new Error('Failed to load buildings');
            const data = await res.json();
            buildingsCache = data.slice();
            // Clear existing options and add placeholder
            startSelect.innerHTML = '';
            endSelect.innerHTML = '';
            const placeholder1 = document.createElement('option');
            placeholder1.value = '';
            placeholder1.textContent = '-- Select start --';
            placeholder1.disabled = true;
            placeholder1.selected = true;
            startSelect.appendChild(placeholder1);

            const placeholder2 = document.createElement('option');
            placeholder2.value = '';
            placeholder2.textContent = '-- Select end --';
            placeholder2.disabled = true;
            placeholder2.selected = true;
            endSelect.appendChild(placeholder2);

            // Render all options. `prevSelections` is an object { start: value, end: value }
            function renderOptions(list, prevSelections = {}) {
                // keep the placeholder at index 0
                startSelect.innerHTML = '';
                endSelect.innerHTML = '';
                const placeholder1 = document.createElement('option');
                placeholder1.value = '';
                placeholder1.textContent = '-- Select start --';
                placeholder1.disabled = true;
                placeholder1.selected = true;
                startSelect.appendChild(placeholder1);

                const placeholder2 = document.createElement('option');
                placeholder2.value = '';
                placeholder2.textContent = '-- Select end --';
                placeholder2.disabled = true;
                placeholder2.selected = true;
                endSelect.appendChild(placeholder2);

                list.forEach(b => {
                    const label = b.Building_Name || b.BuildingName || b.name || b.Abbr || (`Bldg ${b.BldgNo}`);
                    const opt1 = document.createElement('option');
                    opt1.value = b.id;
                    opt1.textContent = label;
                    opt1.dataset.label = label.toLowerCase();
                    startSelect.appendChild(opt1);

                    const opt2 = opt1.cloneNode(true);
                    endSelect.appendChild(opt2);
                });

                // Restore previous selection if still present in the new option list
                if (prevSelections.start) {
                    const match = startSelect.querySelector(`option[value="${prevSelections.start}"]`);
                    if (match) {
                        match.selected = true;
                        // ensure placeholder is not selected
                        if (placeholder1) placeholder1.selected = false;
                    }
                }
                if (prevSelections.end) {
                    const match2 = endSelect.querySelector(`option[value="${prevSelections.end}"]`);
                    if (match2) {
                        match2.selected = true;
                        if (placeholder2) placeholder2.selected = false;
                    }
                }
            }

            // initial render: pass current selections (empty at first)
            renderOptions(buildingsCache, { start: startSelect.value, end: endSelect.value });

            // Attach filter listeners (idempotent)
            // Check if `needle` is a subsequence of `haystack` (letters in same order, not necessarily contiguous)
            function isSubsequence(needle, haystack) {
                if (!needle) return true;
                let i = 0, j = 0;
                while (i < needle.length && j < haystack.length) {
                    if (needle[i] === haystack[j]) i++;
                    j++;
                }
                return i === needle.length;
            }

            function filterOptions(filterValue, selectEl) {
                const q = (filterValue || '').trim().toLowerCase();
                const prev = { start: startSelect.value, end: endSelect.value };
                // If no query, render full list
                if (!q) {
                    renderOptions(buildingsCache, prev);
                    return;
                }
                const filtered = buildingsCache.filter(b => {
                    const label = (b.Building_Name || b.BuildingName || b.name || b.Abbr || (`Bldg ${b.BldgNo}`)).toLowerCase();
                    // Use subsequence matching: typed letters must appear in the same order in the label
                    return isSubsequence(q, label);
                });
                renderOptions(filtered, prev);
            }

            if (startFilter) {
                startFilter.addEventListener('input', function(e) {
                    filterOptions(e.target.value, startSelect);
                });
            }
            if (endFilter) {
                endFilter.addEventListener('input', function(e) {
                    filterOptions(e.target.value, endSelect);
                });
            }

            // enable selects if disabled
            startSelect.disabled = false;
            endSelect.disabled = false;

            // populate place-marker-building select if modal present
            const placeSelect = document.getElementById('place-marker-building');
            if (placeSelect) {
                placeSelect.innerHTML = '';
                const ph = document.createElement('option');
                ph.value = '';
                ph.textContent = '-- Choose building --';
                ph.disabled = true;
                ph.selected = true;
                placeSelect.appendChild(ph);
                buildingsCache.forEach(b => {
                    const lab = b.Building_Name || b.BuildingName || b.name || b.Abbr || (`Bldg ${b.BldgNo}`);
                    const o = document.createElement('option');
                    o.value = b.id;
                    o.textContent = lab;
                    placeSelect.appendChild(o);
                });
            }
        } catch (e) {
            console.error('Error loading buildings:', e);
            // leave selects with a single disabled option to show failure
            startSelect.innerHTML = '';
            endSelect.innerHTML = '';
            const o = document.createElement('option');
            o.value = '';
            o.textContent = '-- Unable to load buildings --';
            o.disabled = true;
            o.selected = true;
            startSelect.appendChild(o.cloneNode(true));
            endSelect.appendChild(o.cloneNode(true));
            startSelect.disabled = true;
            endSelect.disabled = true;
            alert('Failed to load building list from server. See console for details.');
        }
    }

    // Load events from server and render them as markers
    async function loadEvents() {
        try {
            const res = await fetch('/api/events');
            if (!res.ok) throw new Error('Failed to load events');
            const evs = await res.json();
            eventsCache = evs;
            renderEventMarkers(evs);
        } catch (err) {
            console.warn('Could not load events:', err);
        }
    }

    // Modal controls for placing a marker at a preset building
    function openPlaceMarkerModal() {
        const overlay = document.getElementById('place-marker-modal');
        if (!overlay) return;
        overlay.style.display = 'flex';
        // clear inputs
        const title = document.getElementById('place-marker-title');
        const desc = document.getElementById('place-marker-desc');
        if (title) title.value = '';
        if (desc) desc.value = '';
    }

    function closePlaceMarkerModal() {
        const overlay = document.getElementById('place-marker-modal');
        if (!overlay) return;
        overlay.style.display = 'none';
    }

    // Wire modal buttons
    const placeConfirm = document.getElementById('place-marker-confirm');
    const placeCancel = document.getElementById('place-marker-cancel');
    if (placeCancel) placeCancel.addEventListener('click', closePlaceMarkerModal);
    if (placeConfirm) {
        placeConfirm.addEventListener('click', function() {
            const placeSelect = document.getElementById('place-marker-building');
            const titleInput = document.getElementById('place-marker-title');
            const descInput = document.getElementById('place-marker-desc');
            if (!placeSelect || !placeSelect.value) {
                alert('Please choose a building to place the marker at.');
                return;
            }
            const bid = placeSelect.value;
            const b = buildingsCache.find(x => String(x.id) === String(bid));
            if (!b) {
                alert('Selected building not found.');
                return;
            }
            const lat = b.latitude || b.lat;
            const lng = b.longitude || b.lng;
            if (!(lat && lng)) {
                alert('Selected building does not have coordinates.');
                return;
            }
            addCustomMarker([parseFloat(lat), parseFloat(lng)], titleInput.value || (b.Building_Name || b.name || 'Marker'), descInput.value || '');
            closePlaceMarkerModal();
        });
    }

    function renderEventMarkers(events) {
        eventsLayer.clearLayers();
        // build per-building queues and register markers
        buildingEventsMap = {};
        eventsMarkerMap = {};
        const now = Date.now();
        events.forEach(ev => {
            const bId = ev.building_rowid || ev.building_id || ev.building || ev.buildingRowId || ev.buildingRow || null;
            // attach a received timestamp if not present
            if (!ev._receivedAt) ev._receivedAt = now;
            if (bId) {
                if (!buildingEventsMap[String(bId)]) buildingEventsMap[String(bId)] = new Queue();
                buildingEventsMap[String(bId)].enqueue(ev);
            }
        });
        events.forEach(ev => {
            const lat = ev.latitude || ev.lat;
            const lng = ev.longitude || ev.lng;
            if (lat && lng) {
                const m = L.marker([parseFloat(lat), parseFloat(lng)], { title: ev.name || 'Event' });
                // include a small link to view all events for this building
                const bId = ev.building_rowid || ev.building_id || ev.building || ev.buildingRowId || ev.buildingRow || null;
                const popupHtml = `
                    <div class="popup-event">
                        <h3>${ev.name || 'Event'}</h3>
                        <p>${ev.description || ''}</p>
                        <p class="text-muted">${ev.time || ''}</p>
                        ${bId ? `<p><a href="#" class="view-all-events" data-bid="${bId}">View all events at this building</a></p>` : ''}
                    </div>
                `;
                m.bindPopup(popupHtml);
                m.on('popupopen', function() {
                    // attach click handler for "View all events"
                    setTimeout(() => {
                        const link = document.querySelector('.view-all-events[data-bid="' + bId + '"]');
                        if (link) {
                            link.addEventListener('click', function(evnt) {
                                evnt.preventDefault();
                                openEventsListModal(bId);
                            });
                        }
                    }, 50);
                });
                eventsLayer.addLayer(m);
                // store marker for potential removal later; use event id or a generated key
                const key = ev.id || ev.event_id || (`evt-${String(Math.random()).slice(2,10)}`);
                // persist the marker key on the event so purge can find it even if backend omits id
                ev._markerKey = String(key);
                eventsMarkerMap[String(key)] = { marker: m, event: ev };
            }
        });

        // start purge interval
        if (purgeIntervalId) clearInterval(purgeIntervalId);
        purgeIntervalId = setInterval(purgeOldEvents, PURGE_INTERVAL_MS);
    }

    // Remove expired events from queues and markers
    function purgeOldEvents() {
        const now = Date.now();
        // For each building queue, dequeue while head is expired
        Object.keys(buildingEventsMap).forEach(bid => {
            const q = buildingEventsMap[bid];
            if (!q || !q.head) return;
            while (q.head) {
                const ev = q.peek();
                const received = ev._receivedAt || now;
                if ((now - received) > EVENT_TTL_MS) {
                    // expired
                    const popped = q.dequeue();
                    // remove any marker associated with this event
                    const key = popped._markerKey || popped.id || popped.event_id || null;
                    if (key && eventsMarkerMap[String(key)]) {
                        try { window.pittMap.removeLayer(eventsMarkerMap[String(key)].marker); } catch (e) {}
                        delete eventsMarkerMap[String(key)];
                    }
                } else break; // head not expired -> stop
            }
            // if queue became empty, delete it
            if (q.length === 0) delete buildingEventsMap[bid];
        });
        // update UI modal if open
        const modal = document.getElementById('events-list-modal');
        if (modal && modal.style.display === 'flex') {
            const nameEl = document.getElementById('events-modal-building-name');
            const buildingName = nameEl ? nameEl.textContent : null;
            if (buildingName) {
                // try to find building id by name (best-effort)
                const b = buildingsCache.find(x => (x.Building_Name || x.name || x.Abbr || (`Bldg ${x.BldgNo}`)) === buildingName);
                if (b) {
                    // re-render modal content
                    openEventsListModal(b.id);
                }
            }
        }
    }

    // Open modal showing linked-list of events for building id
    function openEventsListModal(buildingId) {
        const modal = document.getElementById('events-list-modal');
        const nameEl = document.getElementById('events-modal-building-name');
        const listEl = document.getElementById('events-modal-list');
        if (!modal || !listEl) return;
        // find building name for display
        const b = buildingsCache.find(x => String(x.id) === String(buildingId));
        nameEl.textContent = b ? (b.Building_Name || b.name || b.Abbr || `Bldg ${b.BldgNo}`) : `Building ${buildingId}`;
        // render linked list
        listEl.innerHTML = '';
        const ll = buildingEventsMap[String(buildingId)];
        const container = document.createElement('div');
        container.className = 'events-list';
        if (!ll) {
            container.textContent = 'No events found for this building.';
        } else {
            let node = ll.head;
            while (node) {
                const ev = node.value;
                const n = document.createElement('div');
                n.className = 'event-node';
                n.innerHTML = `<h4>${ev.name || 'Event'}</h4><p>${ev.time || ''} — ${ev.description || ''}</p>`;
                container.appendChild(n);
                node = node.next;
            }
        }
        listEl.appendChild(container);
        modal.style.display = 'flex';
    }

    // Close events modal
    const eventsModalClose = document.getElementById('events-modal-close');
    if (eventsModalClose) eventsModalClose.addEventListener('click', function() {
        const modal = document.getElementById('events-list-modal');
        if (modal) modal.style.display = 'none';
    });

    async function findPath() {
        const s = startSelect.value;
        const e = endSelect.value;
        if (!s || !e) return alert('Select start and end buildings.');

        // Find building objects for selected start/end
        const startBuilding = buildingsCache.find(b => b.id == s);
        const endBuilding = buildingsCache.find(b => b.id == e);
        if (!startBuilding || !endBuilding) return alert('Could not find building coordinates.');

        // Get coordinates
        let startCoords = null, endCoords = null;
        if (startBuilding.latitude && startBuilding.longitude) {
            startCoords = L.latLng(parseFloat(startBuilding.latitude), parseFloat(startBuilding.longitude));
        } else if (startBuilding.lat && startBuilding.lng) {
            startCoords = L.latLng(parseFloat(startBuilding.lat), parseFloat(startBuilding.lng));
        }
        if (endBuilding.latitude && endBuilding.longitude) {
            endCoords = L.latLng(parseFloat(endBuilding.latitude), parseFloat(endBuilding.longitude));
        } else if (endBuilding.lat && endBuilding.lng) {
            endCoords = L.latLng(parseFloat(endBuilding.lat), parseFloat(endBuilding.lng));
        }
        if (!startCoords || !endCoords) return alert('Selected buildings do not have coordinates.');

        // Remove existing routing control
        if (currentRoutingControl) {
            window.pittMap.removeControl(currentRoutingControl);
            currentRoutingControl = null;
        }

        // Add Leaflet Routing Machine control
        currentRoutingControl = L.Routing.control({
            waypoints: [startCoords, endCoords],
            routeWhileDragging: false,
            show: false,
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true,
            lineOptions: { styles: [{ color: 'blue', weight: 5 }] }
        }).addTo(window.pittMap);
    }

    if (startSelect && endSelect) {
        loadBuildings();
    }

    // Load events on init
    loadEvents();

    if (findPathButton) {
        findPathButton.addEventListener('click', function() {
            findPath();
        });
    }

    // Toggle events button
    const toggleEventsButton = document.getElementById('toggle-events');
    if (toggleEventsButton) {
        toggleEventsButton.addEventListener('click', function() {
            if (window.pittMap.hasLayer(eventsLayer)) {
                window.pittMap.removeLayer(eventsLayer);
                toggleEventsButton.textContent = 'Show Events';
                toggleEventsButton.classList.remove('btn-danger');
                toggleEventsButton.classList.add('btn-info');
            } else {
                window.pittMap.addLayer(eventsLayer);
                toggleEventsButton.textContent = 'Hide Events';
                toggleEventsButton.classList.remove('btn-info');
                toggleEventsButton.classList.add('btn-danger');
            }
        });
    }
}

// Toggle drop marker mode on/off
function toggleDropMarkerMode() {
    dropMarkerMode = !dropMarkerMode;
    const button = document.getElementById('drop-marker');
    const map = window.pittMap;
    
    if (dropMarkerMode) {
        button.textContent = 'Cancel Drop';
        button.classList.remove('btn-secondary');
        button.classList.add('btn-warning');
        map.getContainer().style.cursor = 'crosshair';
    } else {
        button.textContent = 'Drop Marker';
        button.classList.remove('btn-warning');
        button.classList.add('btn-secondary');
        map.getContainer().style.cursor = '';
    }
}

// Add a custom marker to the map
function addCustomMarker(coords, title, description) {
    if (window.pittMap) {
        const marker = L.marker(coords).addTo(window.pittMap);
        marker.bindPopup(`
            <div class="popup-content">
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
        `);
        return marker;
    }
}

// Get current map bounds
function getMapBounds() {
    if (window.pittMap) {
        return window.pittMap.getBounds();
    }
    return null;
}

// Fit map to show all markers
function fitMapToMarkers() {
    if (window.pittMap) {
        const group = new L.featureGroup();
        window.pittMap.eachLayer(function(layer) {
            if (layer instanceof L.Marker) {
                group.addLayer(layer);
            }
        });
        if (group.getLayers().length > 0) {
            window.pittMap.fitBounds(group.getBounds().pad(0.1));
        }
    }
}
// Add this function to get and show user's current location
// Start tracking and showing the user's current location.
// Uses watchPosition to update the marker and accuracy circle as the user moves.
function startTrackingCurrentLocation(options = { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }) {
    if (!navigator.geolocation) {
        console.warn('Geolocation not supported by browser.');
        return null;
    }

    let locationMarker = null;
    let accuracyCircle = null;

    function success(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy; // in meters
        const coords = [lat, lng];

        // Create marker if not exists
        if (!locationMarker) {
            // Use a custom icon if available
            const locationIcon = window.pittLocationIcon || L.icon({
                iconUrl: '/static/img/location-icon.svg',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            locationMarker = L.marker(coords, {
                title: 'Your Current Location',
                riseOnHover: true,
                icon: locationIcon
            }).addTo(window.pittMap);
            locationMarker.bindPopup('<b>You are here</b>');
            // store reference to icon globally so subsequent markers reuse it
            window.pittLocationIcon = locationIcon;
        } else {
            locationMarker.setLatLng(coords);
        }

        // Create or update accuracy circle
        if (!accuracyCircle) {
            accuracyCircle = L.circle(coords, {
                radius: accuracy,
                color: '#136AEC',
                fillColor: '#136AEC',
                fillOpacity: 0.15,
                weight: 2
            }).addTo(window.pittMap);
        } else {
            accuracyCircle.setLatLng(coords);
            accuracyCircle.setRadius(accuracy);
        }

        // Store global coordinates for other features
        window.currentLocation = coords;

        // Optionally open popup and center if zoomed out
        if (window.pittMap.getZoom() < CAMPUS_ZOOM) {
            window.pittMap.setView(coords, CAMPUS_ZOOM);
        }
    }

    function error(err) {
        console.warn('Geolocation error:', err.message);
        // Don't alert repeatedly; optionally show a one-time message
    }

    const watchId = navigator.geolocation.watchPosition(success, error, options);

    // Return an object so caller can stop tracking if needed
    return {
        stop: function() {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            if (locationMarker) window.pittMap.removeLayer(locationMarker);
            if (accuracyCircle) window.pittMap.removeLayer(accuracyCircle);
            window.currentLocation = null;
        },
        getMarker: function() { return locationMarker; },
        getAccuracyCircle: function() { return accuracyCircle; }
    };
}

// Call this function after initializing the map
// Initialize map and start location tracking once DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupEventListeners();

    // Start tracking user's current location (if available)
    try {
        window.pittLocationTracker = startTrackingCurrentLocation();
    } catch (e) {
        console.error('Failed to start location tracking:', e);
    }
});
window.PittFindMap = {
    addCustomMarker,
    getMapBounds,
    fitMapToMarkers,
    CAMPUS_CENTER,
    CAMPUS_ZOOM
};

// Cleanup timers on unload
window.addEventListener('unload', function() {
    try {
        if (purgeIntervalId) clearInterval(purgeIntervalId);
    } catch (e) {}
});

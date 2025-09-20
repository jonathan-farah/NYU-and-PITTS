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
    
    // Add click handler for dropping markers
    map.on('click', function(e) {
        if (dropMarkerMode) {
            const title = prompt('Enter marker title:');
            if (title) {
                const description = prompt('Enter marker description (optional):') || '';
                addCustomMarker([e.latlng.lat, e.latlng.lng], title, description);
                toggleDropMarkerMode(); // Turn off drop mode after placing marker
            }
        }
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
            toggleDropMarkerMode();
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
    const findPathButton = document.getElementById('find-path');

    // Hold a reference to the drawn path so we can remove it
    let currentPathLayer = null;

    async function loadBuildings() {
        try {
            const res = await fetch('/api/buildings');
            if (!res.ok) throw new Error('Failed to load buildings');
            const data = await res.json();
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

            data.forEach(b => {
                const label = b.Building_Name || b.BuildingName || b.name || b.Abbr || (`Bldg ${b.BldgNo}`);
                const opt1 = document.createElement('option');
                opt1.value = b.id;
                opt1.textContent = label;
                startSelect.appendChild(opt1);

                const opt2 = opt1.cloneNode(true);
                endSelect.appendChild(opt2);
            });

            // enable selects if disabled
            startSelect.disabled = false;
            endSelect.disabled = false;
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

    async function findPath() {
        const s = startSelect.value;
        const e = endSelect.value;
        if (!s || !e) return alert('Select start and end buildings.');

        try {
            const res = await fetch(`/api/pathfind?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Pathfinding failed');

            // Remove existing path layer
            if (currentPathLayer) {
                window.pittMap.removeLayer(currentPathLayer);
                currentPathLayer = null;
            }

            // Extract lat/lng for each building in path. We expect building rows to have Address only currently, so try using approximate logic:
            const latlngs = [];
            json.path.forEach(b => {
                // If building has lat/lng fields, use them; otherwise we can't draw accurate lines.
                if (b.latitude && b.longitude) {
                    latlngs.push([parseFloat(b.latitude), parseFloat(b.longitude)]);
                } else if (b.lat && b.lng) {
                    latlngs.push([parseFloat(b.lat), parseFloat(b.lng)]);
                } else {
                    // No coordinates available; skip marker. In simple case we can try to geocode address, but that's outside scope.
                    console.warn('No coordinates for building in path:', b);
                }
            });

            if (latlngs.length >= 2) {
                currentPathLayer = L.polyline(latlngs, { color: 'red', weight: 4 }).addTo(window.pittMap);
                window.pittMap.fitBounds(currentPathLayer.getBounds().pad(0.15));
            } else {
                alert('Path returned but buildings do not contain coordinate information to draw the route.');
            }

        } catch (err) {
            console.error('Pathfinding error:', err);
            alert('Unable to find path. See console for details.');
        }
    }

    if (startSelect && endSelect) {
        loadBuildings();
    }

    if (findPathButton) {
        findPathButton.addEventListener('click', function() {
            findPath();
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

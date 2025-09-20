const CAMPUS_CENTER = [40.4443, -79.9606];
const CAMPUS_ZOOM = 16;

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupEventListeners();
});

// Initialize the Leaflet map with UPitt campus
function initializeMap() {
    const map = L.map('map').setView(CAMPUS_CENTER, CAMPUS_ZOOM);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // No specific location markers for now

    window.pittMap = map;
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

window.PittFindMap = {
    addCustomMarker,
    getMapBounds,
    fitMapToMarkers,
    CAMPUS_CENTER,
    CAMPUS_ZOOM
};

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

    const cathedralMarker = L.marker(CAMPUS_CENTER).addTo(map);
    cathedralMarker.bindPopup(`
        <div class="popup-content">
            <h3>Cathedral of Learning</h3>
            <p>The iconic centerpiece of the University of Pittsburgh Oakland campus.</p>
            <p><strong>Address:</strong> 4200 Fifth Ave, Pittsburgh, PA 15260</p>
        </div>
    `);

    const campusBuildings = [
        {
            name: "Hillman Library",
            coords: [40.4448, -79.9615],
            description: "Main library of the University of Pittsburgh"
        },
        {
            name: "William Pitt Union",
            coords: [40.4440, -79.9595],
            description: "Student union building"
        },
        {
            name: "Posvar Hall",
            coords: [40.4435, -79.9620],
            description: "Social sciences building"
        },
        {
            name: "Benedum Hall",
            coords: [40.4430, -79.9600],
            description: "Engineering building"
        }
    ];

    campusBuildings.forEach(building => {
        const marker = L.marker(building.coords).addTo(map);
        marker.bindPopup(`
            <div class="popup-content">
                <h3>${building.name}</h3>
                <p>${building.description}</p>
            </div>
        `);
    });

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

    const toggleButton = document.getElementById('toggle-buildings');
    if (toggleButton) {
        toggleButton.addEventListener('click', function() {
            console.log('Toggle buildings functionality - to be implemented');
            alert('Building toggle feature will be available when building data is added!');
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

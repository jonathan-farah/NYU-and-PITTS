import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's default marker icons issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

export default function MapView() {
  const [buildings, setBuildings] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null); // User's location

  const pittCenter = [40.4440, -79.9532];

  // Fetch buildings and events from backend
  useEffect(() => {
    fetch("http://localhost:5000/api/buildings")
      .then(res => res.json())
      .then(data => setBuildings(data))
      .catch(err => console.error(err));
  }, []);

  // Get user's current location using browser geolocation API
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
          // Optionally fallback to a fixed location
          setCurrentLocation(pittCenter);
        }
      );
    } else {
      // Geolocation not supported, fallback
      setCurrentLocation(pittCenter);
    }
  }, []);

  return (
    <div className="h-screen w-full">
      <MapContainer center={pittCenter} zoom={16} scrollWheelZoom={true} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Render building markers */}
        {buildings.map(b => (
          <Marker key={b.id} position={b.coords}>
            <Popup>
              <h2 className="font-bold">{b.name}</h2>
              {b.events.length > 0 ? (
                <ul className="list-disc ml-4">
                  {b.events.map(e => (
                    <li key={e.id}>{e.name} <span className="text-gray-500">({e.time})</span></li>
                  ))}
                </ul>
              ) : <p className="text-gray-500">No events scheduled</p>}
            </Popup>
          </Marker>
        ))}

        {/* Render current location marker */}
        {currentLocation && (
          <Marker position={currentLocation}>
            <Popup>
              <span className="font-bold text-blue-500">You are here</span>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

import sqlite3
import time
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut

# Initialize Nominatim geocoder
geolocator = Nominatim(user_agent="pittsburgh-campus-map-script", timeout=10)

def format_full_address(address, zip_code=None):
    """
    Format the address in standard style:
    Street number + name + type, City, State (optional ZIP)
    Example: "1600 Amphitheatre Parkway, Mountain View, CA 94043"
    """
    if not address:
        return None

    # Convert to title case
    address = address.title()
    full_address = f"{address}, Pittsburgh, PA"
    if zip_code:
        full_address += f" {zip_code}"
    return full_address

def get_lat_long(full_address):
    """
    Use geopy with Nominatim to get latitude and longitude for a given full address.
    Returns (lat, lon) or (None, None) if not found.
    """
    try:
        location = geolocator.geocode(full_address, exactly_one=True, addressdetails=False)
        if location:
            return location.latitude, location.longitude
    except GeocoderTimedOut:
        print(f"Timeout geocoding '{full_address}', retrying...")
        time.sleep(1)
        return get_lat_long(full_address)
    except Exception as e:
        print(f"Error geocoding '{full_address}': {e}")
    return None, None

def add_lat_long_columns(conn):
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(buildings)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'latitude' not in columns:
        cursor.execute("ALTER TABLE buildings ADD COLUMN latitude REAL")
    if 'longitude' not in columns:
        cursor.execute("ALTER TABLE buildings ADD COLUMN longitude REAL")
    conn.commit()

def update_lat_long_for_buildings(db_path='backend/app.db'):
    conn = sqlite3.connect(db_path)
    add_lat_long_columns(conn)
    cursor = conn.cursor()

    cursor.execute("SELECT rowid, address, zip_code FROM buildings")
    rows = cursor.fetchall()

    for rowid, address, zip_code in rows:
        if not address:
            continue

        # Format the address in standard style
        full_address = format_full_address(address, zip_code)
        lat, lon = get_lat_long(full_address)

        # Fallback: try without ZIP if first attempt fails
        if lat is None or lon is None:
            fallback_address = format_full_address(address)
            lat, lon = get_lat_long(fallback_address)
            if lat is not None and lon is not None:
                print(f"⚠️ Fallback worked for rowid {rowid}: {fallback_address}")

        if lat is not None and lon is not None:
            cursor.execute(
                "UPDATE buildings SET latitude = ?, longitude = ? WHERE rowid = ?",
                (lat, lon, rowid)
            )
            print(f"✅ Updated rowid {rowid}: {full_address} → lat={lat}, lon={lon}")
        else:
            print(f"❌ Could not find lat/long for rowid {rowid} (address: {full_address})")

        # Respect Nominatim rate limit
        time.sleep(1)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    update_lat_long_for_buildings()

"""
Generate a `paths` table by computing straight-line (haversine) distances between buildings
that have `latitude` and `longitude` columns in the `buildings` table.

Usage:
    python generate_paths_from_coords.py

This will create a `paths` table and insert bidirectional edges between all pairs (or a subset)
-- for a small campus dataset this is acceptable. For larger datasets you may want to limit to
nearest neighbors only.
"""
import sqlite3
import os
import math


def get_db_path():
    return os.path.join(os.path.dirname(__file__), 'buildings.db')


def haversine(lat1, lon1, lat2, lon2):
    # returns meters
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2*R*math.asin(math.sqrt(a))


def create_paths_table(conn):
    conn.execute('''
    CREATE TABLE IF NOT EXISTS paths (
        from_building_id INTEGER NOT NULL,
        to_building_id INTEGER NOT NULL,
        distance REAL NOT NULL
    )
    ''')
    conn.commit()


def main():
    db = get_db_path()
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Check for latitude/longitude columns
    cols = [r[1] for r in cur.execute("PRAGMA table_info(buildings)")]
    if 'latitude' not in cols or 'longitude' not in cols:
        print('buildings table does not contain latitude/longitude columns. Aborting.')
        conn.close()
        return

    rows = list(cur.execute('SELECT rowid as id, latitude, longitude FROM buildings'))
    if not rows:
        print('No buildings found with coordinates.')
        conn.close()
        return

    # Create paths table
    create_paths_table(conn)

    # Build pairwise distances (O(n^2) -- ok for small campus)
    edges = []
    for i in range(len(rows)):
        id1, lat1, lon1 = rows[i]
        try:
            lat1 = float(lat1); lon1 = float(lon1)
        except Exception:
            continue
        for j in range(i+1, len(rows)):
            id2, lat2, lon2 = rows[j]
            try:
                lat2 = float(lat2); lon2 = float(lon2)
            except Exception:
                continue
            d = haversine(lat1, lon1, lat2, lon2)
            edges.append((id1, id2, d))
            edges.append((id2, id1, d))

    # Insert into DB (replace existing paths)
    cur.execute('DELETE FROM paths')
    cur.executemany('INSERT INTO paths(from_building_id, to_building_id, distance) VALUES (?, ?, ?)', edges)
    conn.commit()
    print(f'Inserted {len(edges)} path edges into database')
    conn.close()


if __name__ == '__main__':
    main()

"""
Fill missing latitude/longitude in `app.db` using OpenStreetMap Nominatim geocoding.

This script will:
- find buildings where `latitude` or `longitude` is NULL/empty
- attempt to geocode their address (Address + City + Zip) using Nominatim
- update the database with returned coordinates

Usage:
  python fill_missing_coords.py          # runs and updates DB (with a short delay between requests)
  python fill_missing_coords.py --dry    # shows what would be updated without writing
  python fill_missing_coords.py --force-campus  # fill missing coords with campus center coords

Notes:
- Nominatim has rate limits. This script sleeps 1 second between requests.
- Geocoding accuracy varies; review results before using in production.
"""

import sqlite3
import os
import time
import argparse
import requests


DB_NAME = 'app.db'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'PittFind/1.0 (contact: pittfind@example.com)'


def get_db_path():
    return os.path.join(os.path.dirname(__file__), DB_NAME)


def fetch_buildings(conn):
    cur = conn.cursor()
    cur.execute('PRAGMA table_info(buildings)')
    cols = [c[1] for c in cur.fetchall()]
    cur.execute('SELECT rowid, ' + ','.join(cols) + ' FROM buildings')
    out = []
    for r in cur.fetchall():
        row = {'rowid': r[0]}
        for i, col in enumerate(cols, start=1):
            row[col] = r[i]
        out.append(row)
    return out


def geocode_address(query):
    params = {
        'q': query,
        'format': 'json',
        'limit': 1
    }
    headers = {'User-Agent': USER_AGENT}
    try:
        r = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data:
            lat = float(data[0]['lat'])
            lon = float(data[0]['lon'])
            return lat, lon
    except Exception as e:
        print('Geocode error for', query, e)
    return None, None


def main(dry=False, force_campus=False):
    db = get_db_path()
    if not os.path.exists(db):
        print('Database not found at', db)
        return

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    buildings = fetch_buildings(conn)

    with_coords = [b for b in buildings if b.get('latitude') not in (None, '', 'NULL') and b.get('longitude') not in (None, '', 'NULL')]
    missing = [b for b in buildings if b.get('latitude') in (None, '', 'NULL') or b.get('longitude') in (None, '', 'NULL')]

    print(f'Total buildings: {len(buildings)}, with coords: {len(with_coords)}, missing: {len(missing)}')

    updates = []

    # If user requests force campus, use campus center coords
    campus_center = (40.4443, -79.9606)

    for b in missing:
        rowid = b['rowid']
        if force_campus:
            updates.append((campus_center[0], campus_center[1], rowid))
            continue

        # Build an address string for geocoding
        parts = []
        for key in ('Address', 'City', 'Zip_Code'):
            if key in b and b[key]:
                parts.append(str(b[key]))
        if not parts:
            print('No address fields for row', rowid, '- skipping')
            continue
        query = ', '.join(parts)
        print('Geocoding:', query)
        lat, lon = geocode_address(query)
        if lat is not None and lon is not None:
            updates.append((lat, lon, rowid))
        else:
            print('No geocode result for', rowid)
        time.sleep(1.0)  # be polite to Nominatim

    if not updates:
        print('No updates to perform')
        conn.close()
        return

    print('Planned updates (first 10):')
    for u in updates[:10]:
        print('rowid', u[2], '->', u[0], u[1])

    if dry:
        print('Dry run - no changes written')
        conn.close()
        return

    cur = conn.cursor()
    cur.executemany('UPDATE buildings SET latitude = ?, longitude = ? WHERE rowid = ?', updates)
    conn.commit()
    print('Applied', len(updates), 'updates')
    conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry', action='store_true', help='Do not write changes')
    parser.add_argument('--force-campus', action='store_true', help='Fill missing coords with campus center coords')
    args = parser.parse_args()
    main(dry=args.dry, force_campus=args.force_campus)

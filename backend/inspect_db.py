#!/usr/bin/env python3
import sqlite3, os, json
p = os.path.join(os.path.dirname(__file__), 'app.db')
print('db path:', p, 'exists=', os.path.exists(p))
if not os.path.exists(p):
    print(json.dumps({'error': 'db_not_found', 'path': p}))
    raise SystemExit(1)
conn = sqlite3.connect(p)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
summary = {'tables': tables}
# buildings count and null coords
if 'buildings' in tables:
    try:
        cur.execute('SELECT count(*) FROM buildings')
        summary['buildings_count'] = cur.fetchone()[0]
        cur.execute('SELECT count(*) FROM buildings WHERE latitude IS NULL OR longitude IS NULL')
        summary['buildings_null_coords'] = cur.fetchone()[0]
        cur.execute("SELECT rowid, Building_Name, latitude, longitude FROM buildings LIMIT 5")
        summary['buildings_sample'] = []
        for r in cur.fetchall():
            summary['buildings_sample'].append({'rowid': r[0], 'name': r[1], 'latitude': r[2], 'longitude': r[3]})
    except Exception as e:
        summary['buildings_error'] = str(e)
# paths info
if 'paths' in tables:
    try:
        cur.execute('SELECT count(*) FROM paths')
        summary['paths_count'] = cur.fetchone()[0]
        cur.execute('SELECT from_building_id, to_building_id, distance FROM paths LIMIT 5')
        summary['paths_sample'] = []
        for r in cur.fetchall():
            summary['paths_sample'].append({'from_id': r[0], 'to_id': r[1], 'distance': r[2]})
    except Exception as e:
        summary['paths_error'] = str(e)
# check foreign id ranges if paths exist
if 'paths' in tables and 'buildings' in tables:
    try:
        cur.execute('SELECT min(rowid), max(rowid) FROM buildings')
        mn, mx = cur.fetchone()
        summary['buildings_rowid_min'] = mn
        summary['buildings_rowid_max'] = mx
        cur.execute('SELECT min(from_building_id), max(from_building_id), min(to_building_id), max(to_building_id) FROM paths')
        pmin_from, pmax_from, pmin_to, pmax_to = cur.fetchone()
        summary['paths_from_min'] = pmin_from
        summary['paths_from_max'] = pmax_from
        summary['paths_to_min'] = pmin_to
        summary['paths_to_max'] = pmax_to
    except Exception as e:
        summary['paths_ranges_error'] = str(e)
conn.close()
print(json.dumps(summary, indent=2))

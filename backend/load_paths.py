"""
Simple helper to load a CSV of edges into the backend SQLite database.

CSV format (headers expected):
from_building_id,to_building_id,distance

Each id is the SQLite rowid from the `buildings` table. Distance should be a number (meters or chosen units).

Usage:
    python load_paths.py paths.csv

This will create a `paths` table if it doesn't exist and insert rows.
"""
import csv
import sqlite3
import sys
import os


def get_db_path():
    return os.path.join(os.path.dirname(__file__), 'app.db')


def create_paths_table(conn):
    conn.execute('''
    CREATE TABLE IF NOT EXISTS paths (
        from_building_id INTEGER NOT NULL,
        to_building_id INTEGER NOT NULL,
        distance REAL NOT NULL
    )
    ''')
    conn.commit()


def load_csv(csv_path):
    rows = []
    with open(csv_path, newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            try:
                f = int(r['from_building_id'])
                t = int(r['to_building_id'])
                d = float(r['distance'])
                rows.append((f, t, d))
            except Exception as e:
                print('Skipping row (invalid):', r, 'error:', e)
    return rows


def main():
    if len(sys.argv) < 2:
        print('Usage: python load_paths.py paths.csv')
        sys.exit(2)

    csv_path = sys.argv[1]
    if not os.path.exists(csv_path):
        print('CSV file not found:', csv_path)
        sys.exit(2)

    db = get_db_path()
    conn = sqlite3.connect(db)
    create_paths_table(conn)

    rows = load_csv(csv_path)
    if not rows:
        print('No valid rows found in CSV.')
        conn.close()
        return

    cur = conn.cursor()
    cur.executemany('INSERT INTO paths(from_building_id, to_building_id, distance) VALUES (?, ?, ?)', rows)
    conn.commit()
    print(f'Inserted {len(rows)} path rows into {db}')
    conn.close()


if __name__ == '__main__':
    main()

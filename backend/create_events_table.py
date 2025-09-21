import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'app.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute('''
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_rowid INTEGER,
    latitude REAL,
    longitude REAL,
    title TEXT,
    organization TEXT,
    description TEXT
)
''')

conn.commit()
conn.close()
print('Events table created or already exists.')

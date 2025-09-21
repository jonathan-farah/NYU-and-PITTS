from flask import Flask, render_template, send_from_directory, jsonify, request
import os
import sqlite3
import heapq

app = Flask(__name__, 
            template_folder='../frontend/templates',
            static_folder='../frontend/static')
app.config['SECRET_KEY'] = 'pittfind-hackathon-2025'

# API endpoint to delete an event by id
@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def api_delete_event(event_id):
    db = get_db_path()
    if not db:
        return jsonify({'error': 'Database not found.'}), 500
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    cur.execute('DELETE FROM events WHERE id = ?', (event_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})
# API endpoint to create a new event
@app.route('/api/events', methods=['POST'])
def api_create_event():
    data = request.get_json(force=True)
    required = ['building_rowid', 'latitude', 'longitude', 'title', 'organization', 'description']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required event fields.'}), 400
    db = get_db_path()
    if not db:
        return jsonify({'error': 'Database not found.'}), 500
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    cur.execute('''
        INSERT INTO events (building_rowid, latitude, longitude, title, organization, description)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        data['building_rowid'],
        data['latitude'],
        data['longitude'],
        data['title'],
        data['organization'],
        data['description']
    ))
    conn.commit()
    event_id = cur.lastrowid
    conn.close()
    return jsonify({'success': True, 'event_id': event_id})

@app.route('/')
def index():
    """Serve the main map page"""
    return render_template('map.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files (CSS, JS, images)"""
    return send_from_directory('../frontend/static', filename)

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return {'status': 'healthy', 'service': 'PittFind Backend'}


def get_db_path():
    # Database lives in the backend folder
    p = os.path.join(os.path.dirname(__file__), 'app.db')
    if not os.path.exists(p):
        return None
    return p


@app.route('/api/buildings')
def api_buildings():
    """Return a list of buildings from the SQLite database.
    Each building is returned as a dict with its columns. We use ROWID as `id`.
    """
    db = get_db_path()
    if not db:
        return jsonify({'error': 'Server database not found.'}), 500
    try:
        conn = sqlite3.connect(db)
    except Exception as e:
        return jsonify({'error': 'Failed to open database: ' + str(e)}), 500
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        cur.execute('SELECT rowid as id, * FROM buildings')
    except sqlite3.OperationalError:
        conn.close()
        return jsonify({'error': 'Database does not contain a `buildings` table.'}), 500

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


def load_graph_from_db(conn):
    """Load graph data from a `paths` table in the DB.
    Expects columns: from_building_id, to_building_id, distance
    Returns graph as adjacency dict keyed by rowid ints.
    """
    cur = conn.cursor()
    # Ensure paths table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='paths'")
    if not cur.fetchone():
        return None, 'paths table not found'

    # Build id -> neighbors graph
    graph = {}
    cur.execute('SELECT from_building_id, to_building_id, distance FROM paths')
    for from_id, to_id, distance in cur.fetchall():
        # use ints for keys
        try:
            f = int(from_id)
            t = int(to_id)
            d = float(distance)
        except Exception:
            continue

        graph.setdefault(f, {})[t] = d
        graph.setdefault(t, {})[f] = d

    return graph, None


def dijkstra_graph(graph, start, end):
    # standard Dijkstra on graph keyed by node ids
    queue = [(0, start, [start])]
    visited = set()

    while queue:
        dist, node, path = heapq.heappop(queue)
        if node == end:
            return path, dist
        if node in visited:
            continue
        visited.add(node)
        for nbr, w in graph.get(node, {}).items():
            if nbr not in visited:
                heapq.heappush(queue, (dist + w, nbr, path + [nbr]))

    return None, float('inf')


@app.route('/api/pathfind')
def api_pathfind():
    """Compute shortest path between two building ROWIDs.
    Query params: start (rowid), end (rowid)
    Returns: { path: [building rows], distance: float }
    """
    start = request.args.get('start')
    end = request.args.get('end')
    if not start or not end:
        return jsonify({'error': 'Provide `start` and `end` query parameters (building rowid).'}), 400

    try:
        start_id = int(start)
        end_id = int(end)
    except ValueError:
        return jsonify({'error': 'start and end must be integer rowids'}), 400

    db = get_db_path()
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row

    graph, err = load_graph_from_db(conn)
    if graph is None:
        conn.close()
        return jsonify({'error': 'Path graph not available on server: ' + (err or '')}), 500

    path_node_ids, total_dist = dijkstra_graph(graph, start_id, end_id)
    if path_node_ids is None:
        conn.close()
        return jsonify({'error': 'No path found between requested nodes.'}), 404

    # Fetch building rows for each node id in path
    cur = conn.cursor()
    buildings = []
    for rid in path_node_ids:
        cur.execute('SELECT rowid as id, * FROM buildings WHERE rowid = ?', (rid,))
        r = cur.fetchone()
        if r:
            buildings.append(dict(r))
        else:
            # missing building row; include placeholder
            buildings.append({'id': rid, 'name': None})

    conn.close()
    return jsonify({'path': buildings, 'distance': total_dist})


@app.route('/api/events')
def api_events():
    """Return current events. If an `events` table exists, return rows joined with building coords when possible.
    Expected `events` table columns (flexible): id, name, description, building_rowid, latitude, longitude, time
    If no events table exists, return an empty list (200).
    """
    db = get_db_path()
    if not db:
        return jsonify([])
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Check for events table
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
    if not cur.fetchone():
        conn.close()
        return jsonify([])

    # Attempt to return useful fields, joining to buildings for coords when possible
    try:
        cur.execute('SELECT * FROM events')
        events = [dict(r) for r in cur.fetchall()]
    except Exception:
        conn.close()
        return jsonify([])

    # For each event, if it references a building_rowid, try to fetch lat/lng
    for ev in events:
        lat = ev.get('latitude') or ev.get('lat')
        lng = ev.get('longitude') or ev.get('lng')
        if (lat is None or lng is None) and ev.get('building_rowid'):
            try:
                cur.execute('SELECT latitude, longitude FROM buildings WHERE rowid = ?', (ev.get('building_rowid'),))
                b = cur.fetchone()
                if b:
                    ev['latitude'] = b['latitude']
                    ev['longitude'] = b['longitude']
            except Exception:
                pass

    conn.close()
    return jsonify(events)

# Future API endpoints:
# @app.route('/api/buildings')
# @app.route('/api/events') 
# @app.route('/api/pathfind')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

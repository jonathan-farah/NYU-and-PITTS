from flask import Flask, render_template, send_from_directory, jsonify, request
import os
import sqlite3
import heapq

app = Flask(__name__, 
            template_folder='../frontend/templates',
            static_folder='../frontend/static')
app.config['SECRET_KEY'] = 'pittfind-hackathon-2025'

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
    return os.path.join(os.path.dirname(__file__), 'buildings.db')


@app.route('/api/buildings')
def api_buildings():
    """Return a list of buildings from the SQLite database.
    Each building is returned as a dict with its columns. We use ROWID as `id`.
    """
    db = get_db_path()
    conn = sqlite3.connect(db)
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

# Future API endpoints:
# @app.route('/api/buildings')
# @app.route('/api/events') 
# @app.route('/api/pathfind')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

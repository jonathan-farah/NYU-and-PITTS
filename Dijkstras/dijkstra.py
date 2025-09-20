import sqlite3
import heapq

# Connect to SQLite
conn = sqlite3.connect("pitt_events.db")
cursor = conn.cursor()

# Build the graph from the database
graph = {}

# Load building names and map IDs to names
cursor.execute("SELECT id, name FROM buildings")
id_to_name = {row[0]: row[1] for row in cursor.fetchall()}

# Load paths and create adjacency list
cursor.execute("SELECT from_building_id, to_building_id, distance FROM paths")
for from_id, to_id, distance in cursor.fetchall():
    from_name = id_to_name[from_id]
    to_name = id_to_name[to_id]

    if from_name not in graph:
        graph[from_name] = {}
    if to_name not in graph:
        graph[to_name] = {}

    # Add both directions if paths are bidirectional
    graph[from_name][to_name] = distance
    graph[to_name][from_name] = distance

conn.close()

def dijkstra(graph, start, end):
    """
    Find the shortest path from start to end using Dijkstra's algorithm.
    Returns the path and total distance.
    """
    # Priority queue: stores (distance_from_start, current_node, path_taken)
    queue = [(0, start, [start])]
    visited = set()

    while queue:
        (dist, current, path) = heapq.heappop(queue)

        if current == end:
            return path, dist  # Shortest path found

        if current in visited:
            continue
        visited.add(current)

        for neighbor, neighbor_dist in graph.get(current, {}).items():
            if neighbor not in visited:
                heapq.heappush(queue, (dist + neighbor_dist, neighbor, path + [neighbor]))

    return None, float("inf")  # If no path found
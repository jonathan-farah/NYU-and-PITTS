from flask import Flask, render_template, send_from_directory

app = Flask(__name__)
app.config['SECRET_KEY'] = 'pittfind-hackathon-2025'

@app.route('/')
def index():
    """Serve the main map page"""
    return render_template('map.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files (CSS, JS, images)"""
    return send_from_directory('static', filename)

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return {'status': 'healthy', 'service': 'PittFind Backend'}

# Future API endpoints:
# @app.route('/api/buildings')
# @app.route('/api/events') 
# @app.route('/api/pathfind')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

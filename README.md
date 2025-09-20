# PittFind - University of Pittsburgh Campus Map

A hackathon web application backend built with Flask that serves a static map of the University of Pittsburgh Oakland campus.

## Features

- 🗺️ Interactive map of UPitt Oakland campus using Leaflet.js
- 🏛️ Key campus buildings marked with popup information
- 📱 Responsive design that works on desktop and mobile
- 🎨 Modern, clean UI with Pitt-themed styling
- 🚀 Ready for expansion with building data, events, and pathfinding

## Quick Start

### Prerequisites
- Python 3.7 or higher
- pip (Python package installer)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd NYU-and-PITTS
   ```

2. **Create a virtual environment (recommended)**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**
   ```bash
   python app.py
   ```

5. **Open your browser**
   Navigate to `http://localhost:5000` to view the map.

## Project Structure

```
NYU-and-PITTS/
├── app.py                 # Main Flask application
├── requirements.txt       # Python dependencies
├── templates/
│   └── map.html          # HTML template for the map page
└── static/
    ├── css/
    │   └── style.css     # Custom CSS styling
    ├── js/
    │   └── map.js        # JavaScript for map functionality
    └── images/           # Static images (for future use)
```

## API Endpoints

- `GET /` - Main map page
- `GET /static/<filename>` - Static file serving
- `GET /health` - Health check endpoint

## Future Expansion

The backend is structured to easily add:

- **Building Data API** (`/api/buildings`) - Return detailed building information
- **Events API** (`/api/events`) - Return campus events and activities
- **Pathfinding API** (`/api/pathfind`) - Calculate routes between campus locations
- **Real-time Updates** - WebSocket support for live event updates

## Development

### Adding New Features

1. **New API endpoints**: Add routes in `app.py`
2. **Frontend changes**: Modify files in `templates/` and `static/`
3. **Map markers**: Update the `campusBuildings` array in `static/js/map.js`

### Dependencies for Future Features

Uncomment additional dependencies in `requirements.txt` as needed:
- `Flask-CORS` - For cross-origin requests
- `python-dotenv` - For environment variables
- `requests` - For external API calls
- `geopy` - For geocoding and distance calculations
- `networkx` - For pathfinding algorithms

## Steelhacks 2025

This project was created for Steelhacks 2025 hackathon.

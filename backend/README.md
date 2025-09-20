# Backend

This directory contains all backend-related files for the PittFind application.

## Files

- `app.py` - Main Flask application
- `app.db` - SQLite database with building data
- `buildings.xlsx` - Excel file with building data
- `excel-to-db.py` - Script to convert Excel data to database
- `requirements.txt` - Python dependencies
- `Dijkstras/` - Pathfinding algorithm implementation

## Running the Backend

```bash
cd backend
python app.py
```

The Flask app will run on `http://localhost:5000`

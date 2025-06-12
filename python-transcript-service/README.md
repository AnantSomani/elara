# YouTube Transcript Service

A FastAPI microservice for fetching YouTube video transcripts using the `youtube-transcript-api` library.

## Overview

This service provides a RESTful API for extracting transcripts from YouTube videos. It's designed to work alongside the main Elara website Next.js application.

## Features

- 🎯 Fetch transcripts from YouTube videos using video ID or URL
- 🌍 Multi-language transcript support
- 🛡️ Comprehensive error handling
- 🚀 FastAPI with automatic API documentation
- 🔧 Environment-based configuration
- 📊 Health check endpoints

## Quick Start

### Prerequisites

- Python 3.11+
- pip

### Installation

1. Create and activate a virtual environment:
```bash
cd python-transcript-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create environment file:
```bash
cp .env.example .env  # Then edit .env with your configuration
```

4. Run the service:
```bash
python -m uvicorn app.main:app --reload --port 3001
```

### API Documentation

Once running, visit:
- **Interactive API docs:** http://localhost:3001/docs
- **Alternative docs:** http://localhost:3001/redoc
- **Health check:** http://localhost:3001/health

## Configuration

Key environment variables:

- `PORT`: Service port (default: 3001)
- `HOST`: Service host (default: 0.0.0.0)
- `CORS_ORIGINS`: Allowed CORS origins
- `LOG_LEVEL`: Logging level (info, debug, warning, error)

## Integration

This service is designed to integrate with the main Next.js application by replacing the existing Tactiq-based transcript fetching.

## License

Part of the Elara Website project. 
# DB Look - PostgreSQL Vector Database Explorer

A modern web application for exploring and managing PostgreSQL databases with pgvector support. Built with FastAPI backend and Next.js frontend, this tool provides an intuitive interface for viewing table data, managing vector collections, and performing similarity searches.

## 🌟 Features

- **Database Connection Management**: Connect to multiple PostgreSQL databases with session management
- **Vector Operations**: Full support for pgvector extension with similarity search capabilities
- **Collection Management**: Browse and analyze vector collections with detailed statistics
- **Table Exploration**: View table metadata, relationships, and data with pagination
- **Search Interface**: Perform text and vector similarity searches with multiple distance metrics
- **User Authentication**: Secure user registration and session management
- **Real-time Data**: Live data exploration with efficient caching

## 🏗️ Architecture

```
db_look/
├── backend/           # FastAPI Python backend
│   ├── src/          # Core application modules
│   ├── api.py        # API routes
│   ├── auth.py       # Authentication & authorization
│   ├── database.py   # Database operations
│   ├── main.py       # FastAPI application entry point
│   └── session_manager.py # Session management
├── frontend/         # Next.js React frontend
│   └── src/
│       ├── app/      # Next.js app router
│       ├── components/ # React components
│       ├── lib/      # Utilities and types
│       └── stores/   # State management (Zustand)
└── docs/            # Documentation
```

## 🚀 Quick Start

### Prerequisites

- **Python 3.12+** (for backend)
- **Node.js 18+** (for frontend)
- **uv** (Python package manager)
- **npm** (Node.js package manager)
- **PostgreSQL database** with **pgvector extension**

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies using uv:**
   ```bash
   # Install uv if you haven't already
   curl -LsSf https://astral.sh/uv/install.sh | sh
   
   # Install dependencies
   uv sync
   ```

3. **Set up environment variables:**
   Create a `.env` file in the `backend/` directory:
   ```env
   # Required: Metadata database connection
   APP_METADATA_DB_URL=postgresql://username:password@localhost:5432/metadata_db
   
   # Alternative environment variable names (any one will work):
   # DATABASE_URL=postgresql://username:password@localhost:5432/metadata_db
   # POSTGRES_URL=postgresql://username:password@localhost:5432/metadata_db
   # POSTGRES_URI=postgresql://username:password@localhost:5432/metadata_db
   
   # Security
   APP_JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   ACCESS_TOKEN_EXPIRE_MINUTES=120
   
   # CORS (optional, defaults to "*")
   APP_CORS_ORIGINS=http://localhost:3011,http://localhost:3000
   
   # Cache settings (optional)
   APP_TABLES_CACHE_TTL=60
   APP_METADATA_CACHE_TTL=30
   ```

4. **Run the backend server:**
   ```bash
   uv run uvicorn main:app --reload --host 0.0.0.0 --port 8011
   ```

   The backend will be available at: `http://localhost:8011`

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables (optional):**
   Create a `.env.local` file in the `frontend/` directory:
   ```env
   # Optional: Override default API endpoints
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8011/api
   NEXT_PUBLIC_ROOT_BASE_URL=http://localhost:8011
   ```

   **Note:** If these variables are not set, the frontend will automatically detect the backend URL based on the current domain.

4. **Run the development server:**
   ```bash
   npm run dev
   ```

   The frontend will be available at: `http://localhost:3011`

## 🔧 Configuration

### Backend Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `APP_METADATA_DB_URL` | PostgreSQL connection string for metadata storage | - | ✅ |
| `DATABASE_URL` | Alternative to APP_METADATA_DB_URL | - | ✅ |
| `APP_JWT_SECRET` | Secret key for JWT token signing | "change-me" | ⚠️ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT token expiration time | 120 | ❌ |
| `APP_CORS_ORIGINS` | Allowed CORS origins (comma-separated) | "*" | ❌ |
| `APP_TABLES_CACHE_TTL` | Table cache TTL in seconds | 60 | ❌ |
| `APP_METADATA_CACHE_TTL` | Metadata cache TTL in seconds | 30 | ❌ |

### Frontend Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL | Auto-detected | ❌ |
| `NEXT_PUBLIC_ROOT_BASE_URL` | Backend root URL | Auto-detected | ❌ |

## 📊 Database Requirements

### Metadata Database

The application requires a PostgreSQL database for storing user accounts and session information. The backend will automatically create the required tables:

- `db_look_users` - User accounts
- `db_look_sessions` - Database sessions

### Target Databases

The databases you want to explore should have:

- **PostgreSQL 12+**
- **pgvector extension** (for vector operations)
- Proper network access from the backend server

## 🔐 Authentication Flow

1. **Register/Login**: Create an account or log in with existing credentials
2. **Create Session**: Add a new database connection session
3. **Connect**: Connect to your PostgreSQL database
4. **Explore**: Browse tables, collections, and perform searches

## 🎯 Usage

### Connecting to a Database

1. **Login** to the application
2. **Create a new session** with your database connection details:
   ```
   Name: My Production DB
   Connection String: postgresql://user:pass@host:5432/dbname
   ```
3. **Connect** to start exploring

### Exploring Data

- **Tables View**: Browse all tables with vector columns and relationships
- **Data Tab**: View paginated table data with sorting and filtering
- **Search Tab**: Perform text searches and vector similarity searches
- **Metadata Tab**: Explore table schema, statistics, and relationships

### Vector Operations

- **Collection Browsing**: View vector collections with statistics
- **Similarity Search**: Find similar vectors using cosine, L2, or inner product metrics
- **Vector Visualization**: Inspect individual vector values

## 🏃‍♂️ Development

### Backend Development

```bash
cd backend

# Install in development mode
uv sync --dev

# Run with auto-reload
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8011

# Run tests (if available)
uv run pytest

# Format code
uv run black .
uv run isort .
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server with turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

## 🐳 Production Deployment

### Backend

```bash
cd backend

# Install production dependencies
uv sync --no-dev

# Run with gunicorn or uvicorn
uv run uvicorn main:app --host 0.0.0.0 --port 8011 --workers 4
```

### Frontend

```bash
cd frontend

# Build for production
npm run build

# Start production server
npm run start
```

### Docker (Optional)

You can create Docker containers for both services:

**Backend Dockerfile:**
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy project files
COPY pyproject.toml uv.lock ./
COPY . .

# Install dependencies
RUN uv sync --no-dev

EXPOSE 8011

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8011"]
```

**Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3011

CMD ["npm", "run", "start"]
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection refused**: Check if backend is running on port 8011
2. **CORS errors**: Verify `APP_CORS_ORIGINS` includes your frontend URL
3. **Database connection failed**: Verify connection string and network access
4. **pgvector not found**: Install pgvector extension in your PostgreSQL database

### Debug Mode

Enable verbose logging:

```bash
# Backend
uv run uvicorn main:app --reload --log-level debug

# Frontend
npm run dev -- --debug
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **FastAPI** - Modern, fast web framework for building APIs
- **Next.js** - React framework for production
- **pgvector** - Vector similarity search for PostgreSQL
- **Radix UI** - Low-level UI primitives for React
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - Small, fast and scalable state management

# Fullstack App - Client

## Overview

This is the frontend application for the Fullstack Application, built with React 18.2.0.

## Technology Stack

- **Framework**: React 18.2.0
- **Build Tool**: Create React App (react-scripts 5.0.1)
- **HTTP Client**: Axios 1.6.2
- **Testing**: React Testing Library, Jest

## Key Features

- Modern React application with hooks
- Component-based architecture
- HTTP API integration with backend
- Comprehensive testing setup
- Development proxy to backend server

## Quick Start

### Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn package manager

### Installation

```bash
# Install dependencies
npm install
```

### Running the Application

```bash
# Start development server
npm start
```

The application will start on `http://localhost:3000` and automatically proxy API requests to `http://localhost:8080`.

### Building for Production

```bash
# Create production build
npm run build
```

The optimized production build will be created in the `build/` directory.

## Project Structure

```
client/
├── public/            # Static files
├── src/
│   ├── components/    # React components
│   ├── services/      # API services
│   ├── App.js         # Main application component
│   └── index.js       # Application entry point
├── package.json       # Dependencies and scripts
└── README.md          # Project documentation
```

## Development

### Available Scripts

- `npm start`: Run development server
- `npm test`: Run test suite
- `npm run build`: Create production build
- `npm run eject`: Eject from Create React App (one-way operation)

## API Integration

The client communicates with the backend server through a proxy configuration. All API requests to `/api/*` are automatically forwarded to `http://localhost:8080`.

## Component Documentation

See [Components](components.md) for detailed component documentation.

## Development Guide

See [Development](development.md) for development setup and guidelines.

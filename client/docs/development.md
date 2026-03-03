# Development Guide

## Development Environment Setup

### Prerequisites

1. **Node.js** (v14 or higher)
   ```bash
   node --version
   npm --version
   ```

2. **Code Editor** (recommended: VS Code)
   - ESLint extension
   - Prettier extension
   - React Developer Tools

3. **Browser Extensions**
   - React Developer Tools
   - Redux DevTools (if using Redux)

## Getting Started

### Installation

```bash
# Clone the repository
cd client

# Install dependencies
npm install
```

### Running the Development Server

```bash
# Start development server
npm start
```

The application will open at `http://localhost:3000` with hot reload enabled.

### Environment Variables

Create a `.env` file in the client root:

```env
REACT_APP_API_URL=http://localhost:8080
REACT_APP_ENV=development
```

Access in code:
```javascript
const apiUrl = process.env.REACT_APP_API_URL;
```

## Development Workflow

### Creating a New Component

1. Create component file in appropriate directory
2. Write component logic
3. Add PropTypes validation
4. Create accompanying test file
5. Export component

Example:
```jsx
// src/components/MyComponent.js
import React from 'react';
import PropTypes from 'prop-types';

function MyComponent({ title }) {
  return <h1>{title}</h1>;
}

MyComponent.propTypes = {
  title: PropTypes.string.isRequired,
};

export default MyComponent;
```

### Adding API Services

Create service files in `src/services/`:

```javascript
// src/services/api.js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchData = async () => {
  const response = await api.get('/api/data');
  return response.data;
};

export default api;
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

#### Component Tests

```jsx
// MyComponent.test.js
import { render, screen } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  test('renders with title', () => {
    render(<MyComponent title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
});
```

#### Testing User Interactions

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('handles button click', async () => {
  const handleClick = jest.fn();
  render(<Button onClick={handleClick}>Click Me</Button>);
  
  await userEvent.click(screen.getByText('Click Me'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});
```

#### Testing Async Operations

```jsx
import { render, screen, waitFor } from '@testing-library/react';

test('loads and displays data', async () => {
  render(<DataComponent />);
  
  await waitFor(() => {
    expect(screen.getByText(/data loaded/i)).toBeInTheDocument();
  });
});
```

## Code Style

### ESLint Configuration

The project uses ESLint with React rules. Configuration is in `package.json`:

```json
"eslintConfig": {
  "extends": [
    "react-app",
    "react-app/jest"
  ]
}
```

### Formatting

Use consistent formatting:
- 2 spaces for indentation
- Single quotes for strings
- Semicolons at end of statements
- Trailing commas in objects/arrays

### Naming Conventions

- **Components**: PascalCase (`MyComponent.js`)
- **Functions**: camelCase (`handleClick`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Files**: Match component name or use kebab-case

## Debugging

### React Developer Tools

1. Install browser extension
2. Open browser DevTools
3. Navigate to "Components" or "Profiler" tab

### Console Logging

```javascript
console.log('Debug info:', variable);
console.error('Error:', error);
console.table(arrayOfObjects);
```

### Debugging in VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}/src"
    }
  ]
}
```

## Building for Production

### Create Production Build

```bash
npm run build
```

### Build Optimization

The production build:
- Minifies JavaScript and CSS
- Optimizes images
- Generates source maps
- Applies tree shaking
- Splits code into chunks

### Serving Production Build Locally

```bash
# Install serve globally
npm install -g serve

# Serve the build folder
serve -s build
```

## Common Tasks

### Adding a New Dependency

```bash
npm install package-name
```

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update specific package
npm update package-name

# Update all packages
npm update
```

### Proxy Configuration

API requests are proxied to the backend server. Configuration in `package.json`:

```json
"proxy": "http://localhost:8080"
```

## Troubleshooting

### Port Already in Use

Set a different port:
```bash
PORT=3001 npm start
```

### Clear Cache

```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear npm cache
npm cache clean --force
```

### Build Errors

1. Check Node.js version compatibility
2. Clear cache and reinstall dependencies
3. Check for syntax errors in code
4. Review console error messages

## Performance Optimization

### Code Splitting

```javascript
import React, { lazy, Suspense } from 'react';

const LazyComponent = lazy(() => import('./LazyComponent'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LazyComponent />
    </Suspense>
  );
}
```

### Bundle Analysis

```bash
# Install bundle analyzer
npm install --save-dev webpack-bundle-analyzer

# Analyze bundle
npm run build
npx webpack-bundle-analyzer build/static/js/*.js
```

## Continuous Integration

CI/CD pipeline configuration will be added as the project evolves.

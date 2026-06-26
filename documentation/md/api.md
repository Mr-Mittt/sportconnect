# API Reference

## Base URL

```
http://localhost:8080
```

## Endpoints

### Health Check

#### GET /actuator/health

Check the health status of the application.

**Response:**
```json
{
  "status": "UP"
}
```

## API Conventions

### Request Headers

All API requests should include:

```
Content-Type: application/json
Accept: application/json
```

### Response Format

All API responses follow a consistent JSON structure:

**Success Response:**
```json
{
  "data": { ... },
  "status": "success"
}
```

**Error Response:**
```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  },
  "status": "error"
}
```

### HTTP Status Codes

- `200 OK`: Successful GET, PUT, PATCH requests
- `201 Created`: Successful POST request
- `204 No Content`: Successful DELETE request
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## Authentication

Authentication details will be added as the API evolves.

## Rate Limiting

Rate limiting policies will be documented here as they are implemented.

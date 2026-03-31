# OAuth 2.0 Authorization Code Flow Implementation Guide

## Overview
This MuleSoft application implements OAuth 2.0 Authorization Code flow acting as middleware between the BMO frontend (Next.js) and Auth0 (simulating TD Bank's authorization server). The implementation supports dynamic FDX-compliant data scope requests based on user selection.

## Architecture
```
BMO Frontend (Next.js) → MuleSoft Middleware → Auth0 (TD Bank Simulator)
     ↓                           ↓                      ↓
User Selection → Scope Validation → Token Exchange → Data Access
```

## Configuration

### Environment Configuration (local.yaml)
The Auth0 configuration is stored in `src/main/resources/local.yaml`:

```yaml
oauth:
  auth0:
    domain: "dev-77sisti8b11ec8tp.us.auth0.com"
    authorize_endpoint: "https://dev-77sisti8b11ec8tp.us.auth0.com/authorize"
    token_endpoint: "https://dev-77sisti8b11ec8tp.us.auth0.com/oauth/token"
    client_id: "ywXBlXbbDmE8K2VkuXKy36YjjHlo7iTv"
    client_secret: "${secure::oauth.auth0.client_secret}"  # Secure reference
    audience: "urn:fdx:tdbank"
    redirect_uri: "http://localhost:8081/callback"
```

### Security Configuration
The `client_secret` should be securely configured. For local development:
1. Set the actual secret in `application.properties`:
   ```
   oauth.auth0.client_secret=YOUR_ACTUAL_SECRET_HERE
   ```

## API Endpoints

### 1. OAuth Consent Initiation
**Endpoint:** `GET /api/auth/connect`

**Parameters:**
- `bank` (String): Bank identifier (e.g., "td")
- `access_types` (String): Comma-separated FDX scopes

**Example Request:**
```
GET /api/auth/connect?bank=td&access_types=ACCOUNT_BASIC,TRANSACTIONS
```

**Response:** 
- Success: HTTP 302 redirect to Auth0 authorization URL
- Error: HTTP 400 with JSON error details

**Business Logic:**
1. Validates required parameters (`bank` and `access_types`)
2. Validates FDX scopes against allowed list
3. Constructs authorization URL with:
   - Mandatory OIDC scopes: `openid profile email`
   -
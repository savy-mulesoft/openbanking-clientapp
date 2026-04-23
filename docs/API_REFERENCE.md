# BMO Open Banking - API Reference

> **Complete API documentation for the BMO Open Banking client application**

## 📋 Overview

The BMO Open Banking API follows the **FDX (Financial Data Exchange) v6** standard and is organized into three domain-specific APIs:

1. **FDX Core API** - Account and transaction data (data holder role)
2. **Consent API** - OAuth 2.0 lifecycle management
3. **Aggregator API** - Internal services and TD Bank proxying

## 🔗 Base URLs

| Environment | Base URL |
|-------------|----------|
| Local Development | `http://localhost:8081` |
| CloudHub | `https://ob-bmo-fdx-app-{hash}.{region}.cloudhub.io` |

## 🏛️ FDX Core API

### Overview
BMO acts as a **data holder** exposing its own account and transaction data using FDX v6 schema.

**Base Path:** `/fdx/v6`

### Authentication
- **Type:** Bearer JWT (OAuth 2.0)
- **Scope Required:** `ACCOUNT_BASIC` (accounts), `TRANSACTIONS` (transactions)

### Endpoints

#### Get Accounts
```http
GET /fdx/v6/accounts
```

**Description:** Search for deposit accounts owned by the authenticated user.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `accountId` | string | No | Filter by specific account ID |
| `accountType` | string | No | Filter by account type (CHECKING, SAVINGS) |

**Response:**
```json
{
  "accounts": [
    {
      "accountId": "BMO_CHECKING_001",
      "nickname": "BMO Chequing Account",
      "accountCategory": "DEPOSIT_ACCOUNT",
      "accountType": "CHECKING",
      "status": "OPEN",
      "currency": "CAD",
      "currentBalance": 15400.50,
      "availableBalance": 15400.50,
      "balanceAsOf": "2026-04-15T13:00:00Z"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized (missing/invalid JWT)
- `403` - Forbidden (insufficient scopes)
- `500` - Internal server error

---

#### Get Account Transactions
```http
GET /fdx/v6/accounts/{accountId}/transactions
```

**Description:** Search for transactions within a specific account.

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `accountId` | string | Yes | Account identifier |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startTime` | date-time | No | Filter transactions after this date |
| `endTime` | date-time | No | Filter transactions before this date |
| `limit` | integer | No | Maximum results (default: 25, max: 100) |
| `offset` | integer | No | Pagination offset (default: 0) |

**Response:**
```json
{
  "transactions": [
    {
      "transactionId": "BMO_TXN_001",
      "accountId": "BMO_CHECKING_001",
      "postedTimestamp": "2026-04-14T10:30:00Z",
      "description": "Direct Deposit - Salary",
      "debitCreditMemo": "CREDIT",
      "amount": 3200.00,
      "currency": "CAD",
      "payee": "ACME Corporation",
      "categoryCode": "PAYROLL"
    }
  ],
  "links": {
    "next": "/fdx/v6/accounts/BMO_CHECKING_001/transactions?offset=25&limit=25"
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized
- `403` - Forbidden (missing TRANSACTIONS scope)
- `404` - Account not found
- `500` - Internal server error

---

## 🔐 Consent API

### Overview
Manages OAuth 2.0 consent flows for connecting external banks.

**Base Path:** `/api/auth`, `/api/oauth`

### Endpoints

#### Initiate Bank Connection
```http
GET /api/auth/connect
```

**Description:** Start OAuth consent flow for connecting an external bank.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bank` | string | Yes | Bank identifier (e.g., "TD") |
| `access_types` | string | Yes | Comma-separated FDX scopes |

**Valid Scopes:**
- `ACCOUNT_BASIC` - Account information and balances
- `TRANSACTIONS` - Transaction history
- `CUSTOMER_CONTACT` - Customer contact information

**Example Request:**
```http
GET /api/auth/connect?bank=TD&access_types=ACCOUNT_BASIC,TRANSACTIONS
```

**Response:**
- **Success:** `302 Redirect` to Auth0 authorization endpoint
- **Error:** `400 Bad Request` with JSON error details

```json
{
  "error": "invalid_request",
  "error_description": "Missing required parameter: bank"
}
```

---

#### OAuth Callback Handler
```http
GET /callback
```

**Description:** Handles Auth0 callback after user grants consent.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | Authorization code from Auth0 |
| `state` | string | Yes | State parameter with consent metadata |
| `error` | string | No | Error code if authorization failed |

**Response:**
- **Success:** `302 Redirect` to dashboard with success status
- **Error:** `302 Redirect` to dashboard with error status

---

#### Get Current Session
```http
GET /api/oauth/session
```

**Description:** Retrieve current OAuth session information.

**Response:**
```json
{
  "connected": true,
  "bank": {
    "name": "TD",
    "displayName": "TD Canada Trust",
    "brand": "#00B04F"
  },
  "scopes": ["ACCOUNT_BASIC", "TRANSACTIONS"],
  "expiresAt": "2026-04-15T14:36:08Z",
  "connectedAt": "2026-04-15T13:36:08Z"
}
```

**Status Codes:**
- `200` - Success (may have `connected: false` if no session)
- `500` - Internal server error

---

#### Disconnect Bank
```http
POST /api/oauth/disconnect
```

**Description:** Remove external bank connection and revoke tokens.

**Response:**
```json
{
  "success": true,
  "message": "Bank connection removed successfully"
}
```

**Status Codes:**
- `200` - Success
- `404` - No active connection found
- `500` - Internal server error

---

## 🔄 Aggregator API

### Overview
Internal services for balance aggregation, TD Bank proxying, and demo utilities.

**Base Path:** `/api`

### Endpoints

#### Get Aggregated Balance
```http
GET /api/balance
```

**Description:** Calculate total cash balances across BMO and connected external banks.

**Response:**
```json
{
  "totalBalance": 32650.75,
  "currency": "CAD",
  "accounts": {
    "bmo": {
      "balance": 17400.50,
      "accountCount": 2
    },
    "external": {
      "balance": 15250.25,
      "accountCount": 3,
      "bank": "TD"
    }
  },
  "lastUpdated": "2026-04-15T13:36:08Z"
}
```

---

#### Proxy TD Accounts
```http
GET /api/td/accounts
```

**Description:** Proxy request to TD Bank's FDX accounts endpoint.

**Authentication:** Requires active OAuth session with `ACCOUNT_BASIC` scope.

**Response:** Mirrors TD Bank's `/fdx/v6/accounts` response format.

**Status Codes:**
- `200` - Success
- `401` - No active TD connection
- `403` - Missing ACCOUNT_BASIC scope
- `502` - TD API unavailable

---

#### Proxy TD Transactions
```http
GET /api/td/accounts/{accountId}/transactions
```

**Description:** Proxy request to TD Bank's FDX transactions endpoint.

**Authentication:** Requires active OAuth session with `TRANSACTIONS` scope.

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `accountId` | string | Yes | TD account identifier |

**Response:** Mirrors TD Bank's `/fdx/v6/accounts/{id}/transactions` response format.

**Status Codes:**
- `200` - Success
- `401` - No active TD connection
- `403` - Missing TRANSACTIONS scope
- `404` - Account not found
- `502` - TD API unavailable

---

## 🎨 Frontend Endpoints

### Serve Dashboard
```http
GET /
```

**Description:** Serve the main BMO Open Banking dashboard SPA.

**Response:** HTML content (`bmo-ui.html`)

---

### Serve UI JavaScript
```http
GET /web/bmo-ui.js
```

**Description:** Serve dashboard JavaScript application.

**Response:** JavaScript content with proper MIME type.

---

## 🛠️ Administrative Endpoints

### Clear Cache
```http
POST /api/clear-cache
```

**Description:** Clear all application caches (demo utility).

**Response:**
```json
{
  "success": true,
  "message": "All caches cleared"
}
```

---

### Store Demo Token
```http
POST /api/store-token
```

**Description:** Store per-user token for multi-user demo scenarios.

**Request Body:**
```json
{
  "userId": "demo-user-1",
  "token": "eyJ0eXAi...",
  "scopes": ["ACCOUNT_BASIC", "TRANSACTIONS"],
  "bank": "TD"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token stored successfully"
}
```

---

### Get User Data
```http
GET /api/user-data?userId={userId}
```

**Description:** Retrieve cached user data for demo purposes.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Demo user identifier |

---

### List Connected Users
```http
GET /api/connected-users
```

**Description:** List all users with stored tokens (demo utility).

**Response:**
```json
{
  "users": [
    {
      "userId": "demo-user-1",
      "bank": "TD",
      "scopes": ["ACCOUNT_BASIC", "TRANSACTIONS"],
      "connectedAt": "2026-04-15T13:36:08Z"
    }
  ]
}
```

---

## 📊 Error Handling

### Standard Error Format

All APIs return errors in consistent JSON format:

```json
{
  "error": "error_code",
  "error_description": "Human-readable description",
  "timestamp": "2026-04-15T13:36:08Z",
  "path": "/api/endpoint",
  "correlationId": "abc123-def456"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_request` | 400 | Missing or invalid parameters |
| `unauthorized` | 401 | Missing or invalid authentication |
| `forbidden` | 403 | Insufficient scopes or permissions |
| `not_found` | 404 | Resource not found |
| `server_error` | 500 | Internal server error |
| `bad_gateway` | 502 | External service unavailable |
| `service_unavailable` | 503 | Service temporarily unavailable |

---

## 🔍 FDX Schema Reference

### Account Object
```json
{
  "accountId": "string",
  "nickname": "string", 
  "accountCategory": "DEPOSIT_ACCOUNT|LOC_ACCOUNT|INVESTMENT_ACCOUNT",
  "accountType": "CHECKING|SAVINGS|CD|MONEY_MARKET|LINE_OF_CREDIT",
  "status": "OPEN|CLOSED|PENDING|FROZEN",
  "currency": "string (ISO 4217)",
  "currentBalance": "number",
  "availableBalance": "number",
  "balanceAsOf": "string (date-time)"
}
```

### Transaction Object
```json
{
  "transactionId": "string",
  "accountId": "string",
  "postedTimestamp": "string (date-time)",
  "description": "string",
  "debitCreditMemo": "DEBIT|CREDIT",
  "amount": "number (always positive)",
  "currency": "string (ISO 4217)",
  "payee": "string",
  "categoryCode": "string"
}
```

---

## 📚 SDK Examples

### JavaScript (Frontend)
```javascript
// Get aggregated balance
const response = await fetch('/api/balance');
const balanceData = await response.json();
console.log(`Total: $${balanceData.totalBalance}`);

// Initiate bank connection
window.location.href = '/api/auth/connect?bank=TD&access_types=ACCOUNT_BASIC,TRANSACTIONS';

// Get current session
const session = await fetch('/api/oauth/session').then(r => r.json());
if (session.connected) {
  console.log(`Connected to ${session.bank.displayName}`);
}
```

### cURL Examples
```bash
# Get BMO accounts
curl http://localhost:8081/fdx/v6/accounts

# Get aggregated balance
curl http://localhost:8081/api/balance

# Check OAuth session
curl http://localhost:8081/api/oauth/session

# Disconnect bank
curl -X POST http://localhost:8081/api/oauth/disconnect
```

---

## 🔒 Rate Limiting

| Endpoint Category | Limit | Window |
|------------------|-------|--------|
| FDX Core API | 100 requests | 1 minute |
| OAuth endpoints | 10 requests | 1 minute |
| Aggregator API | 50 requests | 1 minute |
| Administrative | 20 requests | 1 minute |

Rate limits are enforced per client IP address.

---

## 📈 Monitoring

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "UP",
  "components": {
    "objectStore": "UP",
    "auth0": "UP", 
    "tdBank": "UP"
  }
}
```

### Metrics
Standard Mule application metrics are available via JMX on port 1099.

---

*API Reference - Last updated: April 15, 2026*
# BMO Open Banking Client Application

> **Version:** 2.0.0  
> **Technology:** MuleSoft Mule 4.10.5  
> **Status:** Proof of Concept  
> **Date:** April 2026

A comprehensive Open Banking client application demonstrating FDX-compliant account aggregation with OAuth 2.0 consent management for Bank of Montreal (BMO).

## 🎯 Project Overview

This application showcases a **consumer-directed finance** (CDF) pattern where BMO acts as a data aggregator, collecting account and transaction data from external financial institutions (TD Canada Trust) using the **FDX (Financial Data Exchange) API v6** standard. The solution implements OAuth 2.0 authorization flows through Auth0 as the identity provider.

### Key Features

- ✅ **FDX API v6 Compliance** - Standards-based account and transaction APIs
- ✅ **OAuth 2.0 Authorization Code Flow** - Secure consent management via Auth0
- ✅ **Multi-Bank Account Aggregation** - BMO + TD account balance consolidation
- ✅ **Scope-Based Data Access** - Granular consent for account basic info vs transactions
- ✅ **Single Page Application** - Embedded vanilla HTML/CSS/JS dashboard
- ✅ **Server-Side Token Management** - JWT tokens stored securely in Mule Object Store
- ✅ **API-First Design** - OpenAPI 3.0 specifications with Anypoint Exchange governance

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  BMO Dashboard  │    │  BMO Mule App   │    │   Auth0 IdP     │
│   (Browser)     │◄──►│   (localhost)   │◄──►│   (SaaS)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   TD Bank API   │
                       │   (CloudHub)    │
                       └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Java 17** (Azul Zulu recommended)
- **Mule Runtime 4.10.5** (Standalone)
- **Maven 3.6+**
- **Git**

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/savy-mulesoft/openbanking-clientapp.git
   cd ob_client_bmo
   ```

2. **Configure environment**
   ```bash
   # Copy sample configuration
   cp src/main/resources/application.properties.sample src/main/resources/application.properties
   
   # Edit configuration with your Auth0 credentials
   nano src/main/resources/application.properties
   ```

3. **Build and deploy**
   ```bash
   # Build the application
   mvn clean package -DskipTests
   
   # Deploy to local Mule runtime
   cp target/ob_client_bmo-*.jar $MULE_HOME/apps/
   ```

4. **Access the application**
   ```
   http://localhost:8081/
   ```

## 📋 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `http.host` | HTTP listener host | `localhost` |
| `http.port` | HTTP listener port | `8081` |
| `APP_BASE_URL` | Application base URL | `http://localhost:8081` |
| `td.resource_server.base_url` | TD API endpoint | CloudHub URL |

### Auth0 Configuration

Update `src/main/resources/local.yaml`:

```yaml
oauth:
  auth0:
    domain: "your-tenant.auth0.com"
    client_id: "your-client-id"
    client_secret: "${secure::oauth.auth0.client_secret}"
    audience: "urn:fdx:tdbank"
    redirect_uri: "http://localhost:8081/callback"
```

## 🔗 API Endpoints

### Core FDX API
- `GET /fdx/v6/accounts` - Retrieve BMO accounts
- `GET /fdx/v6/accounts/{id}/transactions` - Get account transactions

### OAuth Consent Management
- `GET /api/auth/connect` - Initiate bank connection
- `GET /callback` - OAuth callback handler  
- `GET /api/oauth/session` - Get current session
- `POST /api/oauth/disconnect` - Remove bank connection

### Aggregation API
- `GET /api/balance` - Get aggregated balance across banks
- `GET /api/td/accounts` - Proxy TD account data
- `GET /api/td/accounts/{id}/transactions` - Proxy TD transactions

### Administrative
- `GET /` - Serve dashboard UI
- `POST /api/clear-cache` - Clear application cache
- `GET /api/connected-users` - List connected users (demo)

## 🛠️ Development

### Project Structure

```
ob_client_bmo/
├── src/main/
│   ├── mule/                    # Mule configuration files
│   │   ├── global.xml           # Global HTTP & Object Store config
│   │   ├── ui-flow.xml          # UI serving + FDX Core API
│   │   ├── oauth-flow.xml       # OAuth 2.0 consent flows
│   │   ├── td-proxy-flow.xml    # TD Bank API proxy
│   │   └── cache-management-flow.xml # Demo utilities
│   └── resources/
│       ├── api/                 # OpenAPI specifications
│       │   ├── bmo-fdx-core-api.yaml
│       │   ├── bmo-fdx-consent-api.yaml
│       │   └── bmo-aggregator-api.yaml
│       ├── web/                 # Frontend assets
│       │   ├── bmo-ui.html      # Main dashboard
│       │   ├── bmo-ui.js        # Application logic
│       │   └── images/          # Bank logos
│       ├── application.properties
│       └── local.yaml
├── docs/                        # Documentation
├── pom.xml                      # Maven configuration
└── README.md
```

### Key Technologies

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Mule Enterprise | 4.10.5 |
| Build | Maven | 3.x |
| Java | OpenJDK/Azul Zulu | 17 |
| API Standard | FDX Core API | v6.5 |
| Identity | Auth0 | SaaS |
| Storage | Mule Object Store | - |
| Frontend | Vanilla JS/HTML/CSS | ES5 |

### Running Tests

```bash
# Run unit tests
mvn test

# Run integration tests
mvn integration-test

# Build without tests
mvn clean package -DskipTests
```

## 🔐 Security

### OAuth 2.0 Flow

1. **User initiates connection** - Selects bank and data scopes
2. **Consent request** - Redirect to Auth0 with FDX scopes
3. **User grants consent** - Auth0 consent screen
4. **Authorization code** - Callback with code parameter
5. **Token exchange** - Server exchanges code for JWT
6. **Secure storage** - JWT stored in Mule Object Store
7. **Data access** - Proxy calls using stored JWT

### Security Features

- ✅ **Server-side token storage** - No JWT exposure to browser
- ✅ **CSRF protection** - State parameter validation
- ✅ **Scope enforcement** - FDX scope validation at TD API
- ✅ **JWT validation** - API Manager policy with JWKS verification
- ✅ **Secure configuration** - Encrypted secrets via Mule Secure Properties

## 📊 Monitoring & Observability

### Logging

Application logs include:
- OAuth flow events with correlation IDs
- API request/response logging
- Error handling and debugging information
- Performance metrics

### Health Checks

- `GET /api/health` - Application health status
- Object Store connectivity validation
- External API dependency checks

## 🚦 Deployment

### Local Development
```bash
# Start Mule runtime
$MULE_HOME/bin/mule

# Deploy application
cp target/*.jar $MULE_HOME/apps/

# View logs
tail -f $MULE_HOME/logs/mule_ee.log
```

### CloudHub Deployment
```bash
# Deploy via Anypoint CLI
anypoint-cli runtime-mgr cloudhub-application deploy \
  --artifact-name target/ob_client_bmo-2.0.0.jar \
  --application-name ob-bmo-client \
  --runtime-version 4.10.5 \
  --region us-east-1
```

## 📖 Documentation

- **[Technical Specification](docs/technical-spec.md)** - Detailed system architecture
- **[OAuth Implementation Guide](OAuth_Implementation_Guide.md)** - OAuth 2.0 flow details
- **[API Documentation](src/main/resources/api/)** - OpenAPI specifications
- **[Architecture Diagrams](docs/architecture.drawio)** - Visual system design

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow MuleSoft development best practices
- Include unit tests for new functionality
- Update API documentation for endpoint changes
- Validate against FDX schema compliance
- Test OAuth flows thoroughly

## 🐛 Troubleshooting

### Common Issues

**1. OAuth callback fails**
```bash
# Check Auth0 configuration
curl -X GET "https://your-tenant.auth0.com/.well-known/openid_configuration"

# Verify redirect URI matches Auth0 app settings
```

**2. TD API returns 401 Unauthorized**
```bash
# Check JWT token in Object Store
# Verify API Manager JWT policy configuration
# Confirm JWKS URL is accessible
```

**3. Object Store connection errors**
```bash
# Verify persistent storage directory permissions
# Check Mule runtime logs for Object Store errors
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- **Technical Issues**: Create a GitHub issue
- **Documentation**: Check the `/docs` directory
- **MuleSoft Support**: Contact your MuleSoft representative

---

**Built with ❤️ by the BMO Open Banking Team**

*Last updated: April 2026*
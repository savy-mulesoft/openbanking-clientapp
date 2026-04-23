# BMO Open Banking - Developer Setup Guide

> **Quick start guide for developers setting up the BMO Open Banking client application**

## 🛠️ Development Environment Setup

### Prerequisites Checklist

- [ ] **Java 17** - Azul Zulu, Eclipse Temurin, or Oracle JDK
- [ ] **Mule Runtime 4.10.5** - Standalone distribution
- [ ] **Maven 3.6+** - For dependency management and builds
- [ ] **Git** - Version control
- [ ] **IDE** - Anypoint Studio (recommended) or VS Code with MuleSoft extensions

### Installation Steps

#### 1. Java 17 Installation

**macOS (via Homebrew):**
```bash
brew install --cask zulu17
```

**Windows:**
Download from [Azul Zulu](https://www.azul.com/downloads/?package=jdk#zulu) or use Chocolatey:
```powershell
choco install zulu17
```

**Verify Installation:**
```bash
java -version
# Should show: openjdk version "17.x.x"
```

#### 2. Mule Runtime Installation

1. **Download Mule 4.10.5** from [MuleSoft Downloads](https://www.mulesoft.com/downloads)
2. **Extract to installation directory:**
   ```bash
   # macOS/Linux
   export MULE_HOME=/opt/mule-standalone-4.10.5
   
   # Windows
   set MULE_HOME=C:\mule-standalone-4.10.5
   ```
3. **Add to PATH:**
   ```bash
   export PATH=$MULE_HOME/bin:$PATH
   ```

#### 3. Maven Configuration

**Verify Maven:**
```bash
mvn -version
# Should show Maven 3.6+ and Java 17
```

**Configure MuleSoft repositories** in `~/.m2/settings.xml`:
```xml
<settings>
  <servers>
    <server>
      <id>anypoint-exchange-v3</id>
      <username>your-anypoint-username</username>
      <password>your-anypoint-password</password>
    </server>
  </servers>
</settings>
```

## 🏁 Project Setup

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/savy-mulesoft/openbanking-clientapp.git
cd ob_client_bmo

# Create local configuration
cp src/main/resources/application.properties.template src/main/resources/application.properties
```

### 2. Configure Auth0 Settings

Edit `src/main/resources/local.yaml`:

```yaml
oauth:
  auth0:
    domain: "dev-77sisti8b11ec8tp.us.auth0.com"
    authorize_endpoint: "https://dev-77sisti8b11ec8tp.us.auth0.com/authorize"
    token_endpoint: "https://dev-77sisti8b11ec8tp.us.auth0.com/oauth/token"
    client_id: "ywXBlXbbDmE8K2VkuXKy36YjjHlo7iTv"
    client_secret: "${secure::oauth.auth0.client_secret}"
    audience: "urn:fdx:tdbank"
    redirect_uri: "http://localhost:8081/callback"
```

Update `src/main/resources/application.properties` with the client secret:
```properties
oauth.auth0.client_secret=YOUR_ACTUAL_CLIENT_SECRET
```

### 3. Build and Deploy

```bash
# Clean build
mvn clean package -DskipTests

# Deploy to Mule runtime
cp target/ob_client_bmo-*.jar $MULE_HOME/apps/

# Start Mule (if not already running)
$MULE_HOME/bin/mule
```

### 4. Verify Installation

1. **Check application deployment:**
   ```bash
   tail -f $MULE_HOME/logs/mule_ee.log
   # Look for: "Started app 'ob_client_bmo'"
   ```

2. **Test the dashboard:**
   ```bash
   curl http://localhost:8081/
   # Should return HTML content
   ```

3. **Access the UI:**
   Open [http://localhost:8081](http://localhost:8081) in your browser

## 🔧 Development Workflow

### IDE Setup

#### Anypoint Studio (Recommended)

1. **Import Project:**
   - File → Import → Anypoint Studio → Anypoint Studio project from File System
   - Select the `ob_client_bmo` directory

2. **Configure Runtime:**
   - Right-click project → Run As → Run Configurations
   - Set Mule Runtime to 4.10.5

#### VS Code with MuleSoft Extension

1. **Install Extensions:**
   - MuleSoft Extension Pack
   - XML Language Support

2. **Open Project:**
   ```bash
   code ob_client_bmo
   ```

### Common Development Tasks

#### Running Tests

```bash
# Unit tests only
mvn test

# Integration tests
mvn integration-test

# Skip tests during build
mvn clean package -DskipTests
```

#### Debugging

**Local Debugging:**
1. Start Mule with debug mode:
   ```bash
   $MULE_HOME/bin/mule -M-Dmule.debug.enable=true
   ```

2. Connect debugger on port 5005

**Log Configuration:**
Edit `$MULE_HOME/conf/log4j2.xml` for custom logging:
```xml
<Logger name="org.mule.app.ob_client_bmo" level="DEBUG"/>
```

#### Hot Deployment

During development, you can redeploy quickly:
```bash
# Build and redeploy
mvn clean package -DskipTests && cp target/*.jar $MULE_HOME/apps/
```

## 🧪 Testing Guide

### Manual Testing Scenarios

#### 1. OAuth Flow Testing

1. **Open dashboard:** http://localhost:8081
2. **Click "Add External Bank"** → Select TD
3. **Choose scopes:** ACCOUNT_BASIC, TRANSACTIONS
4. **Complete Auth0 flow**
5. **Verify connection:** Check session via `/api/oauth/session`

#### 2. API Endpoint Testing

**FDX Core API:**
```bash
# Get BMO accounts
curl http://localhost:8081/fdx/v6/accounts

# Get BMO transactions
curl "http://localhost:8081/fdx/v6/accounts/BMO_CHECKING_001/transactions"
```

**Aggregation API:**
```bash
# Get aggregated balance
curl http://localhost:8081/api/balance

# Get TD accounts (requires OAuth session)
curl http://localhost:8081/api/td/accounts
```

#### 3. Error Scenarios

Test error handling:
- Invalid OAuth state parameter
- Expired JWT tokens
- TD API unavailable
- Missing required scopes

### Automated Testing

```bash
# Run all tests with coverage
mvn clean test jacoco:report

# View coverage report
open target/site/jacoco/index.html
```

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. Application Won't Start

**Error:** `Application deployment failed`

**Solutions:**
- Check Java version: `java -version` (must be 17)
- Verify MULE_HOME environment variable
- Check port 8081 availability: `lsof -i :8081`
- Review logs: `tail -f $MULE_HOME/logs/mule_ee.log`

#### 2. OAuth Callback Fails

**Error:** `Invalid callback state`

**Solutions:**
- Verify Auth0 redirect URI matches exactly
- Check Auth0 client configuration
- Clear Object Store: restart Mule application
- Validate local.yaml configuration

#### 3. TD API Returns 401

**Error:** `Unauthorized access to TD resources`

**Solutions:**
- Check Object Store for valid JWT
- Verify JWT hasn't expired
- Test Auth0 JWKS endpoint
- Confirm API Manager policy configuration

#### 4. Object Store Connection Issues

**Error:** `ObjectStore unavailable`

**Solutions:**
- Check file system permissions
- Verify persistent storage directory
- Restart Mule runtime
- Clear Object Store cache

### Debug Commands

```bash
# Check Mule process
ps aux | grep mule

# Test Auth0 connectivity
curl https://dev-77sisti8b11ec8tp.us.auth0.com/.well-known/openid_configuration

# Validate JWT token
curl -H "Authorization: Bearer YOUR_JWT" \
     https://ob-td-fdx-app-fomag7.f5od7g.usa-e2.cloudhub.io/fdx/v6/accounts

# Check Object Store contents (via Mule console)
# Connect to JMX on port 1099
```

## 📝 Code Standards

### MuleSoft Best Practices

1. **Flow Naming:**
   - Use descriptive names: `oauth-connect-flow`
   - Include purpose: `get-accounts-flow`

2. **Error Handling:**
   - Implement try/catch scopes
   - Use correlation IDs
   - Log meaningful error messages

3. **DataWeave:**
   - Use proper null checks: `payload.field default ""`
   - Optimize for readability
   - Validate input/output schemas

4. **Configuration:**
   - Externalize properties
   - Use secure properties for secrets
   - Environment-specific configs

### Git Workflow

```bash
# Feature development
git checkout -b feature/new-oauth-scope
git commit -m "Add support for CUSTOMER_CONTACT scope"
git push origin feature/new-oauth-scope

# Create PR for review
```

## 🔗 Useful Resources

### Documentation
- [MuleSoft Documentation](https://docs.mulesoft.com/)
- [FDX API Standards](https://financialdataexchange.org/FDX/API/)
- [Auth0 Documentation](https://auth0.com/docs/)

### Tools
- [Postman Collection](docs/postman/) - API testing
- [DataWeave Playground](https://developer.mulesoft.com/learn/dataweave/) - Transform testing
- [JSONPath Tester](https://jsonpath.com/) - JSON query validation

### Support
- **Internal:** BMO Open Banking Slack channel
- **MuleSoft:** Support portal
- **Community:** MuleSoft forums

---

**Happy coding! 🚀**
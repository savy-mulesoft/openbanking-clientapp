# BMO Open Banking - Deployment Guide

> **Complete deployment and configuration guide for production and development environments**

## 🎯 Overview

This guide covers deployment strategies, environment configuration, and operational procedures for the BMO Open Banking client application across different environments.

## 🌍 Environment Architecture

### Environment Types

| Environment | Purpose | Infrastructure | URL Pattern |
|-------------|---------|----------------|-------------|
| **Local** | Development | Mule Standalone | `http://localhost:8081` |
| **Development** | Integration Testing | CloudHub Sandbox | `https://ob-bmo-dev-{hash}.{region}.cloudhub.io` |
| **Staging** | Pre-production Testing | CloudHub Production | `https://ob-bmo-stage-{hash}.{region}.cloudhub.io` |
| **Production** | Live Operations | CloudHub Production | `https://ob-bmo-prod-{hash}.{region}.cloudhub.io` |

### Infrastructure Requirements

**CloudHub Specifications:**
- **vCores:** 0.1 (dev), 0.2 (staging), 1.0 (production)
- **Memory:** 1GB (dev), 2GB (staging), 4GB (production)
- **Region:** us-east-1 (primary), us-west-2 (DR)
- **Runtime:** Mule 4.10.5
- **Java:** OpenJDK 17

## 🚀 Local Development Deployment

### Prerequisites

- Java 17 (Azul Zulu recommended)
- Mule Runtime 4.10.5 Standalone
- Maven 3.6+
- Git

### Setup Steps

1. **Environment Configuration**
   ```bash
   # Set environment variables
   export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
   export MULE_HOME=/opt/mule-standalone-4.10.5
   export PATH=$MULE_HOME/bin:$PATH
   ```

2. **Clone and Build**
   ```bash
   git clone https://github.com/savy-mulesoft/openbanking-clientapp.git
   cd ob_client_bmo
   
   # Build application
   mvn clean package -DskipTests
   ```

3. **Configure Properties**
   ```bash
   # Create local configuration
   cp src/main/resources/application.properties.template \
      src/main/resources/application.properties
   
   # Edit with your Auth0 credentials
   nano src/main/resources/application.properties
   ```

4. **Deploy to Mule**
   ```bash
   # Deploy application
   cp target/ob_client_bmo-*.jar $MULE_HOME/apps/
   
   # Start Mule runtime
   $MULE_HOME/bin/mule
   ```

5. **Verify Deployment**
   ```bash
   # Check application status
   curl http://localhost:8081/health
   
   # Test OAuth endpoint
   curl http://localhost:8081/api/oauth/session
   ```

### Local Configuration Files

**`src/main/resources/local.yaml`**
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

http:
  port: 8081
  host: localhost

td:
  resource_server:
    base_url: "https://ob-td-fdx-app-fomag7.f5od7g.usa-e2.cloudhub.io"
```

## ☁️ CloudHub Deployment

### Manual Deployment

#### 1. Anypoint Platform Setup

**Prerequisites:**
- Anypoint Platform account with CloudHub access
- Organization Administrator or Developer permissions
- Valid subscription with available vCores

#### 2. Build for CloudHub

```bash
# Clean build with tests
mvn clean package

# Verify JAR is created
ls -la target/ob_client_bmo-*.jar
```

#### 3. Deploy via Runtime Manager

1. **Login to Anypoint Platform**
   - Navigate to Runtime Manager
   - Click "Deploy Application"

2. **Application Settings**
   - **Application Name:** `ob-bmo-client-dev`
   - **Deployment Target:** CloudHub
   - **Application File:** Upload `target/ob_client_bmo-*.jar`
   - **Runtime Version:** 4.10.5
   - **Worker Size:** 0.1 vCores (dev), 0.2 (staging), 1.0 (prod)

3. **Environment Properties**
   ```properties
   # CloudHub-specific overrides
   APP_BASE_URL=https://ob-bmo-client-dev.us-e1.cloudhub.io
   http.port=8081
   
   # Auth0 configuration
   oauth.auth0.client_secret=YOUR_CLIENT_SECRET
   
   # TD API endpoint
   td.resource_server.base_url=https://ob-td-fdx-app-fomag7.f5od7g.usa-e2.cloudhub.io
   ```

4. **Deploy Application**
   - Click "Deploy Application"
   - Monitor deployment status
   - Verify application starts successfully

#### 4. Verify CloudHub Deployment

```bash
# Health check
curl https://ob-bmo-client-dev.us-e1.cloudhub.io/health

# Test OAuth session endpoint
curl https://ob-bmo-client-dev.us-e1.cloudhub.io/api/oauth/session

# Test FDX Core API
curl https://ob-bmo-client-dev.us-e1.cloudhub.io/fdx/v6/accounts
```

### Automated Deployment (CI/CD)

#### GitHub Actions Workflow

**`.github/workflows/deploy-cloudhub.yml`**
```yaml
name: Deploy to CloudHub

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  ANYPOINT_USERNAME: ${{ secrets.ANYPOINT_USERNAME }}
  ANYPOINT_PASSWORD: ${{ secrets.ANYPOINT_PASSWORD }}
  ANYPOINT_ORG_ID: "e5c02810-ef86-427e-8e6b-f3d3abe55974"

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        environment: [dev, staging, prod]
        include:
          - environment: dev
            branch: develop
            worker_size: "0.1"
            app_name: "ob-bmo-client-dev"
          - environment: staging  
            branch: main
            worker_size: "0.2"
            app_name: "ob-bmo-client-stage"
          - environment: prod
            branch: main
            worker_size: "1.0"
            app_name: "ob-bmo-client-prod"
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up JDK 17
      uses: actions/setup-java@v3
      with:
        java-version: '17'
        distribution: 'zulu'
    
    - name: Cache Maven dependencies
      uses: actions/cache@v3
      with:
        path: ~/.m2
        key: ${{ runner.os }}-m2-${{ hashFiles('**/pom.xml') }}
        restore-keys: ${{ runner.os }}-m2
    
    - name: Build with Maven
      run: mvn clean package -DskipTests
    
    - name: Deploy to CloudHub
      run: |
        mvn deploy -DmuleDeploy \
          -Danypoint.username="$ANYPOINT_USERNAME" \
          -Danypoint.password="$ANYPOINT_PASSWORD" \
          -DapplicationName="${{ matrix.app_name }}" \
          -Denvironment="${{ matrix.environment }}" \
          -Dregion="us-east-1" \
          -DworkerType="Micro" \
          -Dworkers="1" \
          -DobjectStoreV2="true"
```

#### Maven Deployment Plugin

**`pom.xml` Plugin Configuration:**
```xml
<plugin>
    <groupId>org.mule.tools.maven</groupId>
    <artifactId>mule-maven-plugin</artifactId>
    <version>${mule.maven.plugin.version}</version>
    <extensions>true</extensions>
    <configuration>
        <cloudHubDeployment>
            <uri>https://anypoint.mulesoft.com</uri>
            <muleVersion>4.10.5</muleVersion>
            <username>${anypoint.username}</username>
            <password>${anypoint.password}</password>
            <applicationName>${applicationName}</applicationName>
            <environment>${environment}</environment>
            <region>us-east-1</region>
            <workerType>Micro</workerType>
            <workers>1</workers>
            <objectStoreV2>true</objectStoreV2>
            <properties>
                <APP_BASE_URL>https://${applicationName}.us-e1.cloudhub.io</APP_BASE_URL>
                <oauth.auth0.client_secret>${oauth.auth0.client_secret}</oauth.auth0.client_secret>
                <td.resource_server.base_url>${td.resource_server.base_url}</td.resource_server.base_url>
            </properties>
        </cloudHubDeployment>
    </configuration>
</plugin>
```

#### Anypoint CLI Deployment

```bash
# Install Anypoint CLI
npm install -g anypoint-cli

# Login to Anypoint Platform
anypoint-cli login

# Deploy application
anypoint-cli runtime-mgr cloudhub-application deploy \
  --artifact-name target/ob_client_bmo-2.0.0.jar \
  --application-name ob-bmo-client-dev \
  --runtime-version 4.10.5 \
  --region us-east-1 \
  --worker-type Micro \
  --workers 1 \
  --property "APP_BASE_URL:https://ob-bmo-client-dev.us-e1.cloudhub.io" \
  --property "oauth.auth0.client_secret:${CLIENT_SECRET}"
```

## 🔧 Configuration Management

### Environment-Specific Properties

#### Development Environment
```properties
# Application Settings
APP_BASE_URL=https://ob-bmo-client-dev.us-e1.cloudhub.io
http.port=8081

# Auth0 Configuration (Development)
oauth.auth0.domain=dev-77sisti8b11ec8tp.us.auth0.com
oauth.auth0.client_id=ywXBlXbbDmE8K2VkuXKy36YjjHlo7iTv
oauth.auth0.client_secret=${secure::oauth.auth0.client_secret}
oauth.auth0.audience=urn:fdx:tdbank:dev
oauth.auth0.redirect_uri=${APP_BASE_URL}/callback

# External Services
td.resource_server.base_url=https://ob-td-fdx-app-dev.us-e1.cloudhub.io

# Logging
logging.level.root=DEBUG
logging.level.org.mule.app.ob_client_bmo=DEBUG
```

#### Staging Environment
```properties
# Application Settings  
APP_BASE_URL=https://ob-bmo-client-stage.us-e1.cloudhub.io
http.port=8081

# Auth0 Configuration (Staging)
oauth.auth0.domain=bmo-staging.auth0.com
oauth.auth0.client_id=staging-client-id
oauth.auth0.client_secret=${secure::oauth.auth0.client_secret}
oauth.auth0.audience=urn:fdx:tdbank:stage
oauth.auth0.redirect_uri=${APP_BASE_URL}/callback

# External Services
td.resource_server.base_url=https://ob-td-fdx-app-stage.us-e1.cloudhub.io

# Logging
logging.level.root=INFO
logging.level.org.mule.app.ob_client_bmo=INFO
```

#### Production Environment
```properties
# Application Settings
APP_BASE_URL=https://ob-bmo-client-prod.us-e1.cloudhub.io
http.port=8081

# Auth0 Configuration (Production)
oauth.auth0.domain=bmo-prod.auth0.com
oauth.auth0.client_id=prod-client-id
oauth.auth0.client_secret=${secure::oauth.auth0.client_secret}
oauth.auth0.audience=urn:fdx:tdbank:prod
oauth.auth0.redirect_uri=${APP_BASE_URL}/callback

# External Services
td.resource_server.base_url=https://ob-td-fdx-app-prod.us-e1.cloudhub.io

# Logging
logging.level.root=WARN
logging.level.org.mule.app.ob_client_bmo=INFO

# Performance Settings
http.timeout.request=30000
http.timeout.response=30000
oauth.session.ttl=86400
```

### Secure Properties Management

#### CloudHub Secure Properties

**Via Runtime Manager:**
1. Navigate to application in Runtime Manager
2. Go to Settings → Properties
3. Add secure properties:
   ```
   oauth.auth0.client_secret: [HIDDEN VALUE]
   td.api.client.secret: [HIDDEN VALUE]
   agent.general.client_secret: [HIDDEN VALUE]
   ```

#### Local Secure Properties

**`src/main/resources/secure-local.yaml`** (not committed to Git):
```yaml
secure:
  oauth:
    auth0:
      client_secret: "XiHNlNLnDfijsYQMBHt_DKtG7CYVdKD6G2lkZ7hqfUSYay7dYpBT9PHV5tUem6Tm"
```

## 📊 Monitoring & Observability

### CloudHub Monitoring

#### Application Metrics

**Key Metrics to Monitor:**
- **Request Rate:** Requests per second
- **Response Time:** Average response time (ms)
- **Error Rate:** 4xx/5xx error percentage
- **Memory Usage:** JVM heap utilization
- **CPU Usage:** Worker CPU utilization
- **Object Store:** Storage utilization

**Runtime Manager Dashboards:**
- Navigate to Runtime Manager → Applications → {app-name}
- Monitor real-time metrics
- Set up alerts for threshold breaches

#### Custom Alerts

**Alert Configurations:**
```json
{
  "alerts": [
    {
      "name": "High Error Rate",
      "condition": "error_rate > 5%",
      "notification": "email",
      "recipients": ["ops-team@bmo.com"]
    },
    {
      "name": "Memory Usage High", 
      "condition": "memory_usage > 80%",
      "notification": "slack",
      "channel": "#bmo-ob-alerts"
    },
    {
      "name": "Response Time Degradation",
      "condition": "avg_response_time > 2000ms",
      "notification": "pagerduty"
    }
  ]
}
```

### Application Performance Monitoring (APM)

#### DataDog Integration

**Agent Configuration:**
```yaml
# datadog.yaml
api_key: "${DATADOG_API_KEY}"
hostname: "ob-bmo-client-${ENV}"

logs:
  enabled: true
  config_key: "${DATADOG_LOGS_CONFIG_KEY}"

apm:
  enabled: true
  service: "ob-bmo-client"
  env: "${ENV}"
```

**Custom Metrics:**
- OAuth flow success/failure rates
- Token validation latency
- TD API call performance
- User session durations

#### Health Check Endpoint

**Implementation:**
```xml
<flow name="health-check-flow" doc:name="Health Check Flow">
    <http:listener config-ref="HTTP_Listener_config" path="/health" 
                   allowedMethods="GET" doc:name="Health Check Listener"/>
    
    <ee:transform doc:name="Health Status">
        <ee:message>
            <ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
    status: "UP",
    timestamp: now(),
    version: p('app.version'),
    environment: p('mule.env'),
    components: {
        objectStore: "UP",
        auth0: "UP",
        tdBank: "UP"
    }
}]]></ee:set-payload>
        </ee:message>
    </ee:transform>
    
    <logger level="DEBUG" doc:name="Health Check Log" 
            message="Health check requested from #[attributes.remoteAddress]"/>
</flow>
```

### Log Management

#### Structured Logging

**Log4j2 Configuration:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN">
    <Appenders>
        <RollingFile name="FileAppender" fileName="logs/ob-bmo-client.log"
                     filePattern="logs/ob-bmo-client-%d{yyyy-MM-dd}-%i.log.gz">
            <PatternLayout pattern="%d{ISO8601} [%t] %-5level %logger{36} - %msg%n"/>
            <Policies>
                <TimeBasedTriggeringPolicy/>
                <SizeBasedTriggeringPolicy size="100MB"/>
            </Policies>
            <DefaultRolloverStrategy max="10"/>
        </RollingFile>
        
        <Console name="Console" target="SYSTEM_OUT">
            <PatternLayout pattern="%d{HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
        </Console>
    </Appenders>
    
    <Loggers>
        <Logger name="org.mule.app.ob_client_bmo" level="INFO" additivity="false">
            <AppenderRef ref="FileAppender"/>
            <AppenderRef ref="Console"/>
        </Logger>
        
        <Logger name="com.mulesoft.anypoint.objectstore" level="WARN"/>
        <Logger name="org.mule.runtime.core.internal.processor" level="WARN"/>
        
        <Root level="INFO">
            <AppenderRef ref="Console"/>
        </Root>
    </Loggers>
</Configuration>
```

#### Centralized Logging

**ELK Stack Integration:**
```yaml
#
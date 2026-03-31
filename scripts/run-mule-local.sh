#!/usr/bin/env bash
# Single-line-friendly launcher (avoids Terminal wrapping -M-XX:+UseStringDeduplication, etc.)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$HOME/AnypointCodeBuilder/java/jdk-17.0.13+11/Contents/Home}"
export MULE_HOME="${MULE_HOME:-$HOME/AnypointCodeBuilder/runtime/mule-enterprise-standalone-4.10.5}"
exec "$MULE_HOME/localRuntimeExecution.sh" \
  -M-Dmule.forceConsoleLog \
  -M-Dmule.testingMode \
  -M-XX:-UseBiasedLocking \
  -M-Dfile.encoding=UTF-8 \
  -M-XX:+UseG1GC \
  -M-XX:+UseStringDeduplication \
  -M-Dcom.ning.http.client.AsyncHttpClientConfig.useProxyProperties=true \
  -M-Dmule.debugger.test.port=8000 \
  console0

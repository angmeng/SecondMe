#!/bin/bash
# FalkorDB Schema Initialization Script
# Parses the Cypher schema file and executes each statement via GRAPH.QUERY

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
GRAPH_NAME="knowledge_graph"
SCHEMA_FILE="${PROJECT_ROOT}/specs/001-personal-ai-clone/contracts/graph-schema.cypher"
CONTAINER_NAME="secondme_falkordb"

# Load environment variables from .env if it exists
if [ -f "${PROJECT_ROOT}/.env" ]; then
  export $(grep -v '^#' "${PROJECT_ROOT}/.env" | xargs)
fi

PASSWORD="${FALKORDB_PASSWORD:-falkordb_default_password}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "FalkorDB Schema Initialization"
echo "=========================================="
echo "Graph: ${GRAPH_NAME}"
echo "Schema file: ${SCHEMA_FILE}"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo -e "${RED}Error: Container '${CONTAINER_NAME}' is not running.${NC}"
  echo "Start it with: docker-compose up -d falkordb"
  exit 1
fi

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
  echo -e "${RED}Error: Schema file not found: ${SCHEMA_FILE}${NC}"
  exit 1
fi

# Function to execute a Cypher query
execute_query() {
  local query="$1"
  local result

  # Execute the query via docker exec
  # The query is passed as a single argument in double quotes
  result=$(docker exec "$CONTAINER_NAME" redis-cli -a "$PASSWORD" --no-auth-warning \
    GRAPH.QUERY "$GRAPH_NAME" "$query" 2>&1)

  local exit_code=$?

  # Check for various error patterns in the result
  # FalkorDB errors can be: "ERR ...", "Unknown function", "Invalid argument", etc.
  if [ $exit_code -ne 0 ] || echo "$result" | grep -qiE "(^ERR|Unknown function|Invalid|error)"; then
    echo -e "${RED}FAILED${NC}"
    echo "  Query: ${query:0:80}..."
    echo "  Error: $result"
    return 1
  fi

  # Treat "already indexed" as success (idempotent)
  if echo "$result" | grep -q "already indexed"; then
    echo -e "${GREEN}OK${NC} (already exists)"
    return 0
  fi

  # Verify success by checking for expected output patterns
  # Successful queries typically include "Cached execution" or stats like "Nodes created"
  if ! echo "$result" | grep -q "Cached execution\|execution time"; then
    echo -e "${YELLOW}WARN${NC}"
    echo "  Query: ${query:0:80}..."
    echo "  Unexpected output: $result"
    return 1
  fi

  echo -e "${GREEN}OK${NC}"
  return 0
}

# Parse and execute the schema file
echo "Executing schema statements..."
echo ""

# Read the file, strip comments, join lines, and split on semicolons
statement=""
success_count=0
fail_count=0
statement_num=0

while IFS= read -r line || [ -n "$line" ]; do
  # Skip empty lines
  [ -z "$line" ] && continue

  # Skip comment lines (lines starting with //)
  if [[ "$line" =~ ^[[:space:]]*// ]]; then
    continue
  fi

  # Append line to current statement
  if [ -z "$statement" ]; then
    statement="$line"
  else
    statement="$statement $line"
  fi

  # Check if statement is complete (ends with semicolon)
  if [[ "$statement" =~ \;[[:space:]]*$ ]]; then
    # Remove trailing semicolon and whitespace
    statement="${statement%;*}"
    # Trim leading/trailing whitespace without stripping quotes (xargs strips quotes)
    statement="${statement#"${statement%%[![:space:]]*}"}"
    statement="${statement%"${statement##*[![:space:]]}"}"

    # Skip empty statements
    if [ -n "$statement" ]; then
      statement_num=$((statement_num + 1))
      printf "[%2d] " "$statement_num"

      # Show a preview of the statement
      preview="${statement:0:60}"
      if [ ${#statement} -gt 60 ]; then
        preview="${preview}..."
      fi
      printf "%-65s " "$preview"

      if execute_query "$statement"; then
        success_count=$((success_count + 1))
      else
        fail_count=$((fail_count + 1))
      fi
    fi

    # Reset for next statement
    statement=""
  fi
done < "$SCHEMA_FILE"

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo -e "Successful: ${GREEN}${success_count}${NC}"
echo -e "Failed:     ${RED}${fail_count}${NC}"
echo ""

if [ $fail_count -gt 0 ]; then
  echo -e "${YELLOW}Warning: Some statements failed. Check the errors above.${NC}"
  exit 1
else
  echo -e "${GREEN}Schema initialization complete!${NC}"
fi

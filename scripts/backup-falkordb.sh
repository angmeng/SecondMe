#!/bin/bash
#
# FalkorDB Backup Script
# T130: Automated backup for FalkorDB graph database
#
# Usage: ./scripts/backup-falkordb.sh [options]
# Options:
#   -o, --output DIR     Output directory (default: ./backups)
#   -r, --retain DAYS    Retention period in days (default: 7)
#   -h, --help           Show this help message
#

set -e

# Default configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
FALKORDB_HOST="${FALKORDB_HOST:-localhost}"
FALKORDB_PORT="${FALKORDB_PORT:-6379}"
FALKORDB_PASSWORD="${FALKORDB_PASSWORD:-}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--output)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -r|--retain)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -h|--help)
            head -16 "$0" | tail -8
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Timestamp for backup filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/falkordb_backup_${TIMESTAMP}.rdb"

echo "=========================================="
echo "FalkorDB Backup Script"
echo "=========================================="
echo "Timestamp: $(date)"
echo "Host: ${FALKORDB_HOST}:${FALKORDB_PORT}"
echo "Output: ${BACKUP_FILE}"
echo ""

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Build redis-cli command with optional password
REDIS_CLI="redis-cli -h ${FALKORDB_HOST} -p ${FALKORDB_PORT}"
if [ -n "${FALKORDB_PASSWORD}" ]; then
    REDIS_CLI="${REDIS_CLI} -a ${FALKORDB_PASSWORD}"
fi

# Check connection
echo "Checking FalkorDB connection..."
if ! ${REDIS_CLI} ping > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to FalkorDB at ${FALKORDB_HOST}:${FALKORDB_PORT}"
    exit 1
fi
echo "Connection successful."
echo ""

# Trigger RDB save
echo "Triggering BGSAVE..."
${REDIS_CLI} BGSAVE > /dev/null 2>&1

# Wait for background save to complete
echo "Waiting for background save to complete..."
while true; do
    LASTSAVE_BEFORE=$(${REDIS_CLI} LASTSAVE 2>/dev/null)
    sleep 1
    LASTSAVE_AFTER=$(${REDIS_CLI} LASTSAVE 2>/dev/null)
    if [ "${LASTSAVE_BEFORE}" != "${LASTSAVE_AFTER}" ]; then
        break
    fi
    BGSAVE_IN_PROGRESS=$(${REDIS_CLI} INFO persistence 2>/dev/null | grep "rdb_bgsave_in_progress:1" || true)
    if [ -z "${BGSAVE_IN_PROGRESS}" ]; then
        break
    fi
done
echo "Background save complete."
echo ""

# Copy RDB file from container if running in Docker
echo "Copying backup file..."
if command -v docker &> /dev/null; then
    # Check if we're dealing with a Docker container
    CONTAINER_ID=$(docker ps -q -f name=secondme_falkordb 2>/dev/null || true)
    if [ -n "${CONTAINER_ID}" ]; then
        docker cp "${CONTAINER_ID}:/data/dump.rdb" "${BACKUP_FILE}"
    else
        # Local FalkorDB installation
        cp /var/lib/redis/dump.rdb "${BACKUP_FILE}" 2>/dev/null || \
        cp /data/dump.rdb "${BACKUP_FILE}" 2>/dev/null || \
        echo "WARNING: Could not locate dump.rdb file"
    fi
else
    # Local installation
    cp /var/lib/redis/dump.rdb "${BACKUP_FILE}" 2>/dev/null || \
    cp /data/dump.rdb "${BACKUP_FILE}" 2>/dev/null || \
    echo "WARNING: Could not locate dump.rdb file"
fi

# Verify backup was created
if [ -f "${BACKUP_FILE}" ]; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "Backup created successfully: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
    echo "ERROR: Backup file was not created"
    exit 1
fi
echo ""

# Clean up old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "falkordb_backup_*.rdb" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
echo "Deleted ${DELETED_COUNT} old backup(s)."
echo ""

# List current backups
echo "Current backups:"
ls -lh "${BACKUP_DIR}"/falkordb_backup_*.rdb 2>/dev/null || echo "  (none)"
echo ""

# Calculate disk usage
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1)
echo "Total backup storage: ${TOTAL_SIZE}"
echo ""

echo "=========================================="
echo "Backup completed successfully!"
echo "=========================================="

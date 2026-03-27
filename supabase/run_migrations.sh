#!/bin/bash
# ============================================
# CRM Maya - Run All Migrations
# Usage: ./run_migrations.sh "postgresql://postgres:PASSWORD@HOST:5432/postgres"
# ============================================

set -e

if [ -z "$1" ]; then
  echo "Usage: ./run_migrations.sh <DATABASE_URL>"
  echo "Example: ./run_migrations.sh \"postgresql://postgres:password@db.xyz.supabase.co:5432/postgres\""
  exit 1
fi

DATABASE_URL="$1"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

echo "=========================================="
echo "  CRM Maya - Database Migration Runner"
echo "=========================================="
echo ""
echo "Migrations directory: $MIGRATIONS_DIR"
echo ""

# List all SQL files in order
MIGRATION_FILES=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)

if [ -z "$MIGRATION_FILES" ]; then
  echo "No migration files found!"
  exit 1
fi

echo "Migrations to execute:"
for f in $MIGRATION_FILES; do
  echo "  → $(basename "$f")"
done
echo ""

read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Starting migrations..."
echo ""

for f in $MIGRATION_FILES; do
  filename=$(basename "$f")
  echo "▶ Running: $filename"

  if psql "$DATABASE_URL" -f "$f" -v ON_ERROR_STOP=1 > /dev/null 2>&1; then
    echo "  ✓ Success"
  else
    echo "  ✗ FAILED! Stopping."
    echo ""
    echo "Error executing: $filename"
    echo "Run manually to see the full error:"
    echo "  psql \"$DATABASE_URL\" -f \"$f\""
    exit 1
  fi
done

echo ""
echo "=========================================="
echo "  All migrations completed successfully!"
echo "=========================================="

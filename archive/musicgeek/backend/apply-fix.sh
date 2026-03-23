#!/bin/bash
set -e

echo "Applying strumming fix..."
PGPASSWORD='REDACTED' psql -h 192.168.1.17 -p 55432 -U postgres -d guitargeek -f fix-strumming.sql

echo ""
echo "Done! The Strumming 101 lesson now has:"
echo "  - Step 8: Explains continuous down-up-down-up motion"
echo "  - Step 9: Explains the specific D-D-U-D-U pattern"
echo "  - Steps 10-11: Shifted up (mistakes and practice plan)"

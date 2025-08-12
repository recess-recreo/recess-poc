#!/bin/bash

# Simple deployment status checker
set -e

echo "=== Railway Deployment Status Check ==="
echo

# Load token
export RAILWAY_TOKEN="a15e5898-4068-4b78-9c7d-36461537cb1f"

echo "Checking Railway connection..."
echo "Token: ${RAILWAY_TOKEN:0:8}..."
echo

# Try basic status check
echo "Project status:"
if railway status; then
    echo "✓ Status check successful"
else
    echo "❌ Status check failed"
fi
echo

# Try to get domain info
echo "Domain information:"
if railway domain 2>/dev/null; then
    echo "✓ Domain retrieved"
else
    echo "⚠️ Domain not available or service not linked"
fi
echo

# Try to get deployment URL without linking
echo "Attempting direct deployment URL retrieval..."
railway open --help

echo "=== Check Complete ==="
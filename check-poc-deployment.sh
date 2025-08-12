#!/bin/bash

# Script to check POC deployment status
echo "=== POC Deployment Status Check ==="
echo

# Set Railway token
export RAILWAY_TOKEN="a15e5898-4068-4b78-9c7d-36461537cb1f"

# Check project status
echo "Project Status:"
railway status
echo

# Try to get domain information
echo "Checking for domain/URL:"
railway domain || echo "Domain not available or deployment still in progress"
echo

# Try common Railway URL patterns
echo "Testing common Railway URL patterns:"
urls=(
    "https://recess-webapp-poc-production.up.railway.app"
    "https://poc-production.up.railway.app"
    "https://recess-poc-production.up.railway.app"
    "https://web-production-3a69.up.railway.app"
)

for url in "${urls[@]}"; do
    echo -n "Testing $url: "
    if curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" | grep -q "200"; then
        echo "✓ ACCESSIBLE"
        echo "Checking if this is the POC login page..."
        curl -s "$url" | grep -q "Recess POC" && echo "✓ Contains POC content" || echo "✗ Does not contain POC content"
    else
        echo "✗ Not accessible"
    fi
done

echo
echo "=== Deployment Information ==="
echo "Project ID: 3fa5ce82-082c-4663-bc28-c53e3e3aff1f"
echo "Service ID: 3a693036-4d4f-4c7c-a645-f23d37d23bf9"
echo "Build Logs: https://railway.com/project/3fa5ce82-082c-4663-bc28-c53e3e3aff1f/service/3a693036-4d4f-4c7c-a645-f23d37d23bf9"
echo
echo "If deployment is still in progress, wait a few more minutes and run this script again."
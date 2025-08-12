#!/bin/bash

# Simple Railway deployment script
set -e

echo "=== Railway Simple Deployment ==="
echo

# Set token
export RAILWAY_TOKEN="a15e5898-4068-4b78-9c7d-36461537cb1f"

echo "Project Status:"
railway status
echo

echo "Deploying with environment variables..."
export NODE_ENV=production
export SESSION_SECRET="poc-demo-secret-2024"
export OPENROUTER_API_KEY="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"
export DEMO_PASSWORD="recess2024"

echo "Starting deployment..."
railway up --detach

echo "Deployment initiated. Waiting 10 seconds..."
sleep 10

echo "Checking status..."
railway status

echo "Attempting to get domain..."
railway domain || echo "Domain not yet available"

echo "=== Deployment Complete ==="
echo "Check the Railway dashboard for deployment progress"
echo "Project URL: https://railway.com/project/3fa5ce82-082c-4663-bc28-c53e3e3aff1f"
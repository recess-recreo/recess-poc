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
export SITE_URL="https://recess-webapp-poc-production.up.railway.app"
export DEMO_MODE="false"

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
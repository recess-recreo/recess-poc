#!/bin/bash

# Railway Deployment Script for POC Project
# This script requires interactive authentication with Railway

set -e  # Exit on any error

echo "=== Railway POC Project Deployment Script ==="
echo

# Step 1: Authenticate with Railway (requires browser)
echo "Step 1: Authenticating with Railway..."
railway login
echo "✓ Authentication complete"
echo

# Step 2: Link to existing project using the project ID from .env.local
echo "Step 2: Linking to existing project..."
railway link --project "0c859978-f37c-4559-b930-0178f2e48b01"
echo "✓ Project linked"
echo

# Step 3: Check project status
echo "Step 3: Checking project status..."
railway status
echo

# Step 4: Add required services
echo "Step 4: Adding PostgreSQL service..."
railway add postgresql || echo "PostgreSQL might already exist"
echo

echo "Step 5: Adding Redis service..."
railway add redis || echo "Redis might already exist"
echo

# Step 6: Set environment variables from .env.local
echo "Step 6: Setting environment variables..."

# Production environment
railway variables set NODE_ENV="production"

# Session configuration
railway variables set SESSION_SECRET="sIDROVjRzCQ5HBhOGQ5Fl9k6YqKmZ7VEVG8G/wCMpBw="

# API Keys
railway variables set OPENROUTER_API_KEY="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"

# Demo configuration
railway variables set DEMO_PASSWORD="recess2024"

# Site URL (update this after deployment)
railway variables set SITE_URL="https://poc-project-production.up.railway.app"

echo "✓ Environment variables set"
echo

# Step 7: Deploy the application
echo "Step 7: Deploying application..."
railway up --detach

# Step 8: Get deployment status and URL
echo "Step 8: Getting deployment information..."
railway status
echo

echo "Step 9: Getting deployment URL..."
railway domain
echo

echo "=== Deployment Complete ==="
echo
echo "Next Steps:"
echo "1. Update SITE_URL environment variable with your actual deployment URL"
echo "2. Test the application at your Railway URL"
echo "3. Login with password: recess2024"
echo "4. Check logs if needed: railway logs"
echo
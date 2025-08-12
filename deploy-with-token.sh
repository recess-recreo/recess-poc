#!/bin/bash

# Token-Based Railway Deployment Script for POC Project
# This script uses RAILWAY_TOKEN for authentication (no browser required)
# 
# Prerequisites:
# 1. Railway CLI installed: npm install -g @railway/cli
# 2. Valid Railway project token set in .env.local as RAILWAY_TOKEN
# 3. Project services (PostgreSQL, Redis) already configured

set -e  # Exit on any error

echo "=== Token-Based Railway POC Deployment Script ==="
echo

# Load environment variables from .env.local
if [[ -f ".env.local" ]]; then
    echo "Loading environment variables from .env.local..."
    export $(cat .env.local | grep -v '^#' | grep -v '^$' | xargs)
    echo "✓ Environment variables loaded"
else
    echo "❌ Error: .env.local file not found"
    echo "Please ensure .env.local exists in the current directory"
    exit 1
fi

# Project ID (fixed - this is the Railway project UUID)
PROJECT_ID="0c859978-f37c-4559-b930-0178f2e48b01"

echo "Project ID: $PROJECT_ID"
echo

# Step 1: Validate Railway Token
echo "Step 1: Validating Railway authentication..."
if [[ -z "$RAILWAY_TOKEN" ]]; then
    echo "❌ Error: RAILWAY_TOKEN not found in .env.local"
    echo
    echo "To fix this issue:"
    echo "1. Go to Railway Dashboard → Your Project → Settings → Tokens"
    echo "2. Create a new 'Project Token' (not an API token)"
    echo "3. Copy the generated token"
    echo "4. Replace the current RAILWAY_TOKEN value in .env.local with the new token"
    echo "5. The current value ($PROJECT_ID) is a project ID, not a token"
    echo
    echo "Token format should look like: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'"
    echo "Project tokens are scoped to this specific project for security."
    exit 1
fi

# Check if token looks like a proper UUID token (basic validation)
if [[ ! "$RAILWAY_TOKEN" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]] && [[ ${#RAILWAY_TOKEN} -lt 30 ]]; then
    echo "⚠️  Warning: RAILWAY_TOKEN format looks suspicious"
    echo "Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (UUID) or longer secure token"
    echo "Current value: $RAILWAY_TOKEN"
    echo "If this is the project ID, please replace with a proper project token."
    echo
fi

# Test Railway authentication
echo "Testing Railway CLI authentication..."
if ! railway whoami >/dev/null 2>&1; then
    echo "❌ Error: Railway authentication failed"
    echo
    echo "Possible issues:"
    echo "1. Invalid or expired token"
    echo "2. Token is a project ID instead of authentication token"
    echo "3. Railway CLI not installed"
    echo
    echo "To obtain a proper token:"
    echo "1. Visit: https://railway.app/project/$PROJECT_ID/settings/tokens"
    echo "2. Create a new 'Project Token'"
    echo "3. Update RAILWAY_TOKEN in .env.local"
    exit 1
fi

echo "✓ Railway authentication successful"
echo

# Step 2: Link to project (using project ID)
echo "Step 2: Linking to project..."
echo "Project ID: $PROJECT_ID"

# Use railway link with the project ID
if ! railway link --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "❌ Error: Failed to link to project $PROJECT_ID"
    echo "This could mean:"
    echo "1. Token doesn't have access to this project"
    echo "2. Project ID is incorrect"
    echo "3. Project doesn't exist or was deleted"
    exit 1
fi

echo "✓ Successfully linked to project"
echo

# Step 3: Verify project status and services
echo "Step 3: Checking project status and services..."
railway status
echo

# Step 4: Validate required environment variables
echo "Step 4: Validating required environment variables..."

# Check for essential variables from .env.local
required_vars=("SESSION_SECRET" "OPENROUTER_API_KEY" "DEMO_PASSWORD")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
        missing_vars+=("$var")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    echo "❌ Error: Missing required environment variables:"
    printf '  - %s\n' "${missing_vars[@]}"
    echo "Please ensure all required variables are set in .env.local"
    exit 1
fi

echo "✓ All required environment variables found"
echo

# Step 5: Set environment variables for production
echo "Step 5: Setting production environment variables..."

# Production environment
echo "Setting NODE_ENV=production..."
railway variables --set "NODE_ENV=production"

# Session configuration
echo "Setting SESSION_SECRET..."
railway variables --set "SESSION_SECRET=$SESSION_SECRET"

# API Keys
echo "Setting OPENROUTER_API_KEY..."
railway variables --set "OPENROUTER_API_KEY=$OPENROUTER_API_KEY"

# Demo configuration
echo "Setting DEMO_PASSWORD..."
railway variables --set "DEMO_PASSWORD=$DEMO_PASSWORD"

# Default site URL (will need to be updated after deployment)
echo "Setting default SITE_URL..."
railway variables --set "SITE_URL=https://your-project-production.up.railway.app"

echo "✓ Environment variables configured"
echo

# Step 6: Deploy the application
echo "Step 6: Deploying application..."
echo "This may take several minutes..."
railway up --detach

echo "✓ Deployment initiated"
echo

# Step 7: Wait a moment and get deployment status
echo "Step 7: Getting deployment information..."
sleep 5
railway status
echo

# Step 8: Get deployment URL
echo "Step 8: Getting deployment URL..."
if railway domain 2>/dev/null; then
    echo "✓ Domain information retrieved"
else
    echo "⚠️  Domain not yet available or not configured"
    echo "You may need to wait for deployment to complete"
fi
echo

echo "=== Deployment Complete ==="
echo
echo "🚀 Next Steps:"
echo "1. Wait for deployment to complete (check 'railway status')"
echo "2. Get your deployment URL: 'railway domain'"
echo "3. Update SITE_URL environment variable with your actual URL:"
echo "   railway variables set SITE_URL=\"https://your-actual-domain.railway.app\""
echo "4. Test the application at your Railway URL"
echo "5. Login with password: $DEMO_PASSWORD"
echo
echo "🔍 Monitoring Commands:"
echo "- Check deployment status: railway status"
echo "- View logs: railway logs"
echo "- List environment variables: railway variables"
echo "- Open project dashboard: railway open"
echo
echo "🛠️  Troubleshooting:"
echo "- If deployment fails, check logs: railway logs --tail"
echo "- For build issues, ensure all dependencies are in package.json"
echo "- For runtime errors, verify environment variables: railway variables"
echo

# Final validation reminder
echo "📋 Post-Deployment Checklist:"
echo "□ Verify application is accessible at deployment URL"
echo "□ Test login functionality with demo password"
echo "□ Update SITE_URL environment variable if needed"
echo "□ Confirm database and Redis connections are working"
echo "□ Check application logs for any errors"
echo

echo "Deployment script completed successfully!"
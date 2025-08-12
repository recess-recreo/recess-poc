#!/bin/bash

# Workspace Token Railway Deployment Script for POC Project
# This script handles workspace tokens which require different authentication
# 
# Prerequisites:
# 1. Railway CLI installed: npm install -g @railway/cli
# 2. Valid Railway workspace token set in .env.local
# 3. Project services (PostgreSQL, Redis) already configured

set -e  # Exit on any error

echo "=== Workspace Token Railway POC Deployment Script ==="
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
WORKSPACE_TOKEN="472f7206-6b65-406a-9cdf-4fbb4a680fc6"

echo "Project ID: $PROJECT_ID"
echo "Using workspace token: ${WORKSPACE_TOKEN:0:8}..."
echo

# Step 1: Check if Railway CLI is installed
echo "Step 1: Checking Railway CLI installation..."
if ! command -v railway &> /dev/null; then
    echo "❌ Error: Railway CLI not found"
    echo "Please install with: npm install -g @railway/cli"
    exit 1
fi

echo "✓ Railway CLI found (version: $(railway --version))"
echo

# Step 2: Set up authentication
echo "Step 2: Setting up workspace token authentication..."

# Try different token environment variables
export RAILWAY_TOKEN="$WORKSPACE_TOKEN"
export RAILWAY_API_TOKEN="$WORKSPACE_TOKEN"

echo "✓ Token environment variables set"
echo

# Step 3: Attempt to authenticate or provide manual instructions
echo "Step 3: Railway authentication status..."
if railway whoami >/dev/null 2>&1; then
    echo "✓ Already authenticated with Railway"
    railway whoami
else
    echo "⚠️  Railway CLI not authenticated"
    echo
    echo "MANUAL AUTHENTICATION REQUIRED:"
    echo "1. Run: railway login"
    echo "2. Complete the browser-based authentication"
    echo "3. Once logged in, run this script again"
    echo
    echo "Alternatively, if you have a project-specific token:"
    echo "1. Go to: https://railway.app/project/$PROJECT_ID/settings/tokens"
    echo "2. Create a 'Project Token' (not workspace token)"
    echo "3. Replace RAILWAY_TOKEN in .env.local with the project token"
    echo "4. Use the original deploy-with-token.sh script"
    echo
    read -p "Press Enter after completing authentication, or Ctrl+C to exit..."
fi

# Verify authentication worked
echo "Verifying authentication..."
if ! railway whoami >/dev/null 2>&1; then
    echo "❌ Authentication failed. Please complete railway login first."
    exit 1
fi

echo "✓ Authentication verified"
echo

# Step 4: Try to link to project
echo "Step 4: Linking to project..."
echo "Project ID: $PROJECT_ID"

if railway link --project "$PROJECT_ID"; then
    echo "✓ Successfully linked to project"
else
    echo "❌ Failed to link to project"
    echo "Trying alternative approach..."
    
    # List available projects
    echo "Available projects:"
    railway list
    echo
    echo "Please manually run: railway link --project $PROJECT_ID"
    exit 1
fi

echo

# Step 5: Verify project status
echo "Step 5: Checking project status..."
railway status
echo

# Step 6: Set environment variables for production
echo "Step 6: Setting production environment variables..."

# Required variables from .env.local
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

# Set production environment variables
echo "Setting production environment variables..."

railway variables set NODE_ENV="production"
railway variables set SESSION_SECRET="$SESSION_SECRET"
railway variables set OPENROUTER_API_KEY="$OPENROUTER_API_KEY"
railway variables set DEMO_PASSWORD="$DEMO_PASSWORD"
railway variables set SITE_URL="https://your-project-production.up.railway.app"

echo "✓ Environment variables configured"
echo

# Step 7: Deploy the application
echo "Step 7: Deploying application..."
echo "This may take several minutes..."

if railway up --detach; then
    echo "✓ Deployment initiated successfully"
else
    echo "❌ Deployment failed"
    echo "Check logs with: railway logs --tail"
    exit 1
fi

echo

# Step 8: Get deployment information
echo "Step 8: Getting deployment information..."
sleep 5

railway status
echo

# Step 9: Get deployment URL
echo "Step 9: Getting deployment URL..."
if railway domain; then
    echo "✓ Domain information retrieved"
else
    echo "⚠️  Domain not yet available"
    echo "Wait for deployment to complete, then run: railway domain"
fi

echo
echo "=== Deployment Complete ==="
echo
echo "🚀 Next Steps:"
echo "1. Wait for deployment to complete: railway status"
echo "2. Get deployment URL: railway domain"
echo "3. Update SITE_URL with actual URL:"
echo "   railway variables set SITE_URL=\"https://your-actual-domain.railway.app\""
echo "4. Test the application"
echo "5. Login with password: $DEMO_PASSWORD"
echo
echo "🔍 Monitoring Commands:"
echo "- Check status: railway status"
echo "- View logs: railway logs"
echo "- List variables: railway variables"
echo "- Open dashboard: railway open"
echo

echo "Deployment script completed!"
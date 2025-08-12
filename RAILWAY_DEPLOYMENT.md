# Railway Deployment Guide - POC Project

This guide provides step-by-step instructions for deploying the POC project to Railway.

## Prerequisites

1. **Railway CLI installed**: `npm install -g @railway/cli` (Already installed)
2. **Railway account**: Sign up at https://railway.app
3. **Git repository**: Your POC code should be in a Git repository

## Project Setup

The POC project has been configured with:

1. **Authentication fix**: Login now sets both sessionStorage and cookie for proper middleware authentication
2. **Railway configuration**: `railway.json` file created with proper build and deploy settings
3. **Build process**: Tested and verified to compile successfully

## Environment Variables Required

Based on the codebase analysis, you'll need these environment variables in Railway:

### Required Variables:
```bash
NODE_ENV=production
DATABASE_URL=your-railway-postgresql-connection-string
OPENAI_API_KEY=your-openai-api-key
OPENROUTER_API_KEY=your-openrouter-api-key-if-using-openrouter
REDIS_URL=your-railway-redis-connection-string
SESSION_SECRET=your-secure-session-secret
SITE_URL=https://your-railway-app.railway.app
```

### Optional Variables:
```bash
QDRANT_URL=your-qdrant-url-if-using-vector-search
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_HOST=your-qdrant-host
QDRANT_PORT=6334
QDRANT_COLLECTION=your-collection-name
```

## Deployment Steps

### 1. Login to Railway
```bash
railway login
```

### 2. Create a New Railway Project
```bash
railway create poc-project
```

### 3. Link Your Local Project
```bash
railway link
```

### 4. Add Required Services

#### PostgreSQL Database:
```bash
railway add postgresql
```

#### Redis Cache:
```bash
railway add redis
```

### 5. Set Environment Variables

You can set environment variables through the Railway dashboard or CLI:

```bash
# Set environment variables via CLI
railway variables set NODE_ENV=production
railway variables set OPENAI_API_KEY=your-key
railway variables set SESSION_SECRET=your-secret
# ... set all other required variables
```

Or use the Railway dashboard:
1. Go to your project dashboard
2. Click on "Variables" tab
3. Add each environment variable

### 6. Deploy the Application
```bash
railway deploy
```

### 7. Get Your Deployment URL
```bash
railway status
```

## Post-Deployment Configuration

1. **Update SITE_URL**: Once deployed, update the SITE_URL environment variable with your actual Railway URL
2. **Test Authentication**: Visit your app and test the login with password "recess2024"
3. **Database Setup**: If your database needs seeding, you may need to run migrations or seed scripts

## Expected Behavior After Deployment

1. **Root URL** (`https://your-app.railway.app/`): Shows the login form
2. **Login Process**: Enter password "recess2024" to access the demo
3. **Demo URL** (`https://your-app.railway.app/demo/poc1`): The main POC interface (requires authentication)

## Troubleshooting

### Common Issues:

1. **Build Failures**: Check the build logs in Railway dashboard
2. **Database Connection**: Ensure DATABASE_URL is correctly set
3. **Authentication Issues**: Verify SESSION_SECRET is set
4. **API Failures**: Check OPENAI_API_KEY and other API keys

### Logs Access:
```bash
railway logs
```

### Redeploy:
```bash
railway deploy --detach
```

### Environment Variables Check:
```bash
railway variables
```

## Railway Configuration File

The project includes a `railway.json` file with optimized settings:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## Security Notes

- The demo uses a simple password authentication ("recess2024")
- In production, replace with proper authentication system
- Ensure all API keys are properly secured
- Use Railway's built-in environment variable security

## Next Steps After Successful Deployment

1. Test all POC functionality
2. Verify the AI recommendation flow works
3. Check email generation features
4. Validate cost tracking components
5. Monitor performance and logs

---

*Generated for POC deployment to Railway platform*
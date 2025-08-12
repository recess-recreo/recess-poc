# OpenRouter 401 Error Fix - Deployment Guide

## Issue Summary

The OpenRouter API was returning 401 errors in production due to missing or incorrect headers, specifically the HTTP-Referer header that OpenRouter requires for authentication.

## Root Cause

OpenRouter API requires specific headers for authentication:
1. **HTTP-Referer**: Must match the registered domain/URL
2. **X-Title**: Application identifier

The issue was that:
- DEMO_MODE wasn't explicitly disabled in Railway environment
- SITE_URL wasn't being used correctly for the HTTP-Referer header
- Insufficient logging made debugging difficult

## Fixes Applied

### 1. OpenRouter Client Configuration ✅

**File**: `src/lib/ai/openai-client.ts`

Enhanced the OpenRouter client constructor with:
```typescript
const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
console.log(`OpenRouter HTTP-Referer header: ${siteUrl}`);
console.log(`OpenRouter X-Title header: Recess POC`);

this.openai = new OpenAI({
  apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  timeout: 30000,
  defaultHeaders: {
    'HTTP-Referer': siteUrl,
    'X-Title': 'Recess POC',
  },
});
```

### 2. Environment Configuration ✅

**File**: `.env.railway`

Added explicit DEMO_MODE configuration:
```bash
NODE_ENV=production
SESSION_SECRET=poc-demo-secret-2024
OPENROUTER_API_KEY=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
DEMO_PASSWORD=recess2024
SITE_URL=https://recess-webapp-poc-production.up.railway.app
DEMO_MODE=false
```

### 3. Deployment Script Updates ✅

**File**: `railway-simple-deploy.sh`

Updated with correct environment variables:
```bash
export NODE_ENV=production
export SESSION_SECRET="poc-demo-secret-2024"
export OPENROUTER_API_KEY="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"
export DEMO_PASSWORD="recess2024"
export SITE_URL="https://recess-webapp-poc-production.up.railway.app"
export DEMO_MODE="false"
```

## Required Railway Environment Variables

Ensure these environment variables are set in your Railway project:

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Production environment |
| `DEMO_MODE` | `false` | Disable demo mode |
| `SITE_URL` | `https://recess-webapp-poc-production.up.railway.app` | Domain for HTTP-Referer header |
| `OPENROUTER_API_KEY` | `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` | OpenRouter API authentication |
| `SESSION_SECRET` | `poc-demo-secret-2024` | Session encryption |
| `DEMO_PASSWORD` | `recess2024` | Demo authentication |

## Deployment Options

### Option 1: Manual Railway Web Interface

1. Go to Railway Dashboard → Your Project → Variables
2. Set all the environment variables listed above
3. Go to Deployments → Trigger new deployment

### Option 2: Git-based Deployment

Since the project is connected to Railway via Git:

1. Push the committed changes:
```bash
git push origin main
```

2. Railway will automatically trigger a new deployment

### Option 3: CLI Deployment (if authentication works)

```bash
# Set environment variables
railway variables set NODE_ENV="production"
railway variables set DEMO_MODE="false"
railway variables set SITE_URL="https://recess-webapp-poc-production.up.railway.app"
railway variables set OPENROUTER_API_KEY="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"
railway variables set SESSION_SECRET="poc-demo-secret-2024"
railway variables set DEMO_PASSWORD="recess2024"

# Deploy
railway up --detach
```

## Verification Steps

After deployment, verify the fix:

1. **Check Application Logs**:
   - Look for OpenRouter header logging messages
   - Verify SITE_URL is correctly set
   - Confirm no 401 errors from OpenRouter

2. **Test AI Functionality**:
   - Navigate to `/demo/poc1`
   - Input family information
   - Verify AI parsing works without 401 errors

3. **Monitor Headers**:
   The enhanced logging will show:
   ```
   OpenRouter API key configured: sk-or-v1...4cbf
   OpenRouter HTTP-Referer header: https://recess-webapp-poc-production.up.railway.app
   OpenRouter X-Title header: Recess POC
   ```

## Expected Behavior After Fix

- ✅ OpenRouter API calls should work without 401 errors
- ✅ AI family parsing should function correctly
- ✅ Recommendation engine should work
- ✅ Enhanced logging for debugging future issues

## Troubleshooting

### If 401 errors persist:

1. **Verify SITE_URL**: Ensure it matches exactly your Railway deployment URL
2. **Check Logs**: Look for the header logging messages
3. **Validate API Key**: Ensure the OpenRouter API key is valid and not expired
4. **Railway Domain**: Verify your Railway project domain hasn't changed

### Common Issues:

- **Wrong SITE_URL**: Railway generates random domains, ensure it's correct
- **Missing DEMO_MODE**: Must be explicitly set to "false"  
- **Cache Issues**: Clear any Redis cache if applicable
- **Environment Variables**: Ensure all variables are set in Railway dashboard

## Next Steps

1. **Push Changes**: `git push origin main` to trigger automatic deployment
2. **Monitor Deployment**: Check Railway logs for successful deployment
3. **Test Application**: Verify AI functionality works correctly
4. **Update Documentation**: Update any other deployment guides with correct environment variables

---

**Status**: Ready for deployment  
**Files Modified**: 3  
**Environment Variables Updated**: 6  
**Expected Resolution**: 401 errors should be resolved after deployment
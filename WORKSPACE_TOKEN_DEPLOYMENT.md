# Workspace Token Deployment Guide

## Issue Summary

The Railway CLI does not support direct authentication with workspace tokens. The workspace token `472f7206-6b65-406a-9cdf-4fbb4a680fc6` cannot be used directly with the Railway CLI for automated deployments.

## Workspace Token Limitations

1. **Railway CLI Authentication**: The CLI requires interactive browser-based login
2. **Token Type Mismatch**: Workspace tokens are for API access, not CLI authentication
3. **Security Model**: Railway separates API tokens from CLI authentication for security

## Solutions

### Option 1: Interactive Authentication + Manual Deployment

1. **Authenticate with Railway CLI**:
   ```bash
   railway login
   ```
   Complete the browser-based authentication.

2. **Run the deployment script**:
   ```bash
   ./deploy-workspace-token.sh
   ```

### Option 2: Create Project-Specific Token

1. **Visit Railway Project Settings**:
   - Go to: https://railway.app/project/0c859978-f37c-4559-b930-0178f2e48b01/settings/tokens
   - Create a new "Project Token" (not workspace token)

2. **Update .env.local**:
   ```bash
   # Replace the RAILWAY_TOKEN value with your new project token
   RAILWAY_TOKEN="your-new-project-token-here"
   ```

3. **Use the original script**:
   ```bash
   ./deploy-with-token.sh
   ```

### Option 3: Manual Deployment Steps

If you prefer to deploy manually after authentication:

1. **Authenticate**:
   ```bash
   railway login
   ```

2. **Link to project**:
   ```bash
   railway link --project "0c859978-f37c-4559-b930-0178f2e48b01"
   ```

3. **Set environment variables**:
   ```bash
   railway variables set NODE_ENV="production"
   railway variables set SESSION_SECRET="poc-demo-secret-2024"
   railway variables set OPENROUTER_API_KEY="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"
   railway variables set DEMO_PASSWORD="recess2024"
   railway variables set SITE_URL="https://your-project-production.up.railway.app"
   ```

4. **Deploy**:
   ```bash
   railway up
   ```

5. **Get deployment URL**:
   ```bash
   railway domain
   ```

## Recommended Approach

**Option 1** (Interactive Authentication) is recommended because:
- It maintains security best practices
- Works with your existing workspace token
- Provides full CLI functionality after initial authentication
- No need to generate additional tokens

## Next Steps

1. Choose your preferred option above
2. Complete the authentication/token setup
3. Run the deployment
4. Update SITE_URL with the actual deployment URL
5. Test the deployed application

## Project Details

- **Project ID**: `0c859978-f37c-4559-b930-0178f2e48b01`
- **Workspace Token**: `472f7206-6b65-406a-9cdf-4fbb4a680fc6`
- **Environment Variables Required**:
  - `SESSION_SECRET`: `poc-demo-secret-2024`
  - `OPENROUTER_API_KEY`: `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`
  - `DEMO_PASSWORD`: `recess2024`

## Troubleshooting

- If `railway link` fails, try `railway list` to see available projects
- If deployment fails, check `railway logs --tail`
- If domain is not available, wait for deployment to complete
- Verify all environment variables with `railway variables`
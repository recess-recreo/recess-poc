# Railway CLI Syntax Update - Environment Variables

## Issue Fixed
The Railway CLI updated its syntax for setting environment variables. The old `railway variables set` command is no longer valid.

## Old Syntax (DEPRECATED)
```bash
railway variables set KEY="value"
```

## New Syntax (CORRECT)
```bash
railway variables --set "KEY=value"
```

## Corrected Commands for POC Deployment

### Single Variable Setting
```bash
railway variables --set "NODE_ENV=production"
railway variables --set "SESSION_SECRET=your-session-secret"
railway variables --set "OPENROUTER_API_KEY=your-api-key"
railway variables --set "DEMO_PASSWORD=recess2024"
railway variables --set "SITE_URL=https://your-domain.railway.app"
```

### Multiple Variables in One Command
```bash
railway variables \
  --set "NODE_ENV=production" \
  --set "SESSION_SECRET=your-session-secret" \
  --set "OPENROUTER_API_KEY=your-api-key" \
  --set "DEMO_PASSWORD=recess2024" \
  --set "SITE_URL=https://your-domain.railway.app"
```

## Other Useful Railway CLI Commands

### View Current Variables
```bash
# View all variables
railway variables

# View in key=value format
railway variables --kv

# View as JSON
railway variables --json
```

### Service-Specific Variables
```bash
# Set variables for specific service
railway variables --service web --set "KEY=value"

# Set variables for specific environment
railway variables --environment production --set "KEY=value"
```

## Files Updated
The following deployment scripts have been updated with the correct syntax:

1. `/Users/masa/Clients/Recess/projects/poc/deploy-with-token.sh`
2. `/Users/masa/Clients/Recess/projects/poc/deploy-workspace-token.sh`
3. `/Users/masa/Clients/Recess/projects/poc/railway-deployment-script.sh`

## Authentication Requirements
Before setting variables, ensure you're authenticated and linked to the project:

```bash
# Login (browser required)
railway login

# Link to project
railway link --project "0c859978-f37c-4559-b930-0178f2e48b01"

# Verify connection
railway status
```

## Token-Based Authentication
For CI/CD or headless environments, use project tokens:

```bash
# Set environment variable
export RAILWAY_TOKEN="your-project-token"

# Or use in commands directly
RAILWAY_TOKEN="your-project-token" railway variables --set "KEY=value"
```

## Verification
After setting variables, verify they were applied:

```bash
railway variables --kv
```

This will show all environment variables in KEY=value format for easy verification.
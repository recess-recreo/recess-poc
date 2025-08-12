# Railway Authentication Methods

## Token-Based Authentication (No Browser Required)

Railway supports multiple token types for programmatic access without browser interaction:

### 1. Account Tokens
- **Environment Variable**: `RAILWAY_API_TOKEN`
- **Scope**: Full access to all your resources and teams
- **Use Case**: Personal automation, CI/CD with broad permissions

```bash
RAILWAY_API_TOKEN=your_account_token railway whoami
RAILWAY_API_TOKEN=your_account_token railway run
```

### 2. Project Tokens  
- **Environment Variable**: `RAILWAY_TOKEN`
- **Scope**: Limited to specific project/environment
- **Use Case**: CI/CD pipelines, project-specific automation

```bash
RAILWAY_TOKEN=your_project_token railway run
RAILWAY_TOKEN=your_project_token railway up
```

### 3. Team Tokens
- **Environment Variable**: `RAILWAY_API_TOKEN` 
- **Scope**: Access to team resources only
- **Use Case**: Team-wide automation, shared CI/CD

```bash
RAILWAY_API_TOKEN=your_team_token railway whoami
```

## Token Priority
If both tokens are set, `RAILWAY_TOKEN` takes precedence over `RAILWAY_API_TOKEN`.

## Creating Tokens

### Via Web UI
1. **Account/Team Tokens**: Account Settings → Tokens
2. **Project Tokens**: Project Settings → Tokens

### API Usage
All tokens work with Railway's GraphQL API:

```bash
# Account/Team token
curl --request POST \
  --url https://backboard.railway.com/graphql/v2 \
  --header 'Authorization: Bearer <API_TOKEN>' \
  --header 'Content-Type: application/json' \
  --data '{"query":"query { me { name email } }"}'

# Project token  
curl --request POST \
  --url https://backboard.railway.com/graphql/v2 \
  --header 'Project-Access-Token: <PROJECT_TOKEN>' \
  --header 'Content-Type: application/json' \
  --data '{"query":"query { projectToken { projectId } }"}'
```

## Browserless Authentication (Alternative)
For interactive CLI sessions without browser access:

```bash
railway login --browserless
# Generates a pairing code for manual authentication
```

## Common Use Cases

### CI/CD Pipeline
```yaml
env:
  RAILWAY_TOKEN: ${{ secrets.RAILWAY_PROJECT_TOKEN }}
run: |
  railway up
```

### Local Development (Headless)
```bash
export RAILWAY_API_TOKEN="your_token"
railway run npm start
```

### MCP Server Integration
```json
{
  "mcpServers": {
    "railway": {
      "command": "npx",
      "args": ["-y", "@jasontanswe/railway-mcp"],
      "env": {
        "RAILWAY_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Workspace Tokens (Web UI Only)
**Important**: Workspace tokens are designed for web-based operations and do NOT work with the Railway CLI. These tokens are used for:
- Browser-based dashboard access
- Web UI operations
- API calls from web applications

For CLI operations, you must use:
- Account tokens (RAILWAY_API_TOKEN)
- Project tokens (RAILWAY_TOKEN)
- Interactive browser login (`railway login`)

## Token Security Notes
- Project tokens are safer for CI/CD (limited scope)
- Account tokens provide full access - handle with care
- Never commit tokens to version control
- Use secret management tools (1Password, environment variables, etc.)
- Workspace tokens only work in browser contexts, not CLI
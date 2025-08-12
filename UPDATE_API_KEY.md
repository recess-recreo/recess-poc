# Update OpenRouter API Key

## Current Issue
The OpenRouter API key is returning 401 "User not found" error. This means the key is invalid or has been revoked.

## How to Fix

1. **Get a new API key from OpenRouter:**
   - Go to: https://openrouter.ai/keys
   - Sign in to your account
   - Click "Create Key"
   - Name it (e.g., "Recess POC")
   - Copy the new key (starts with `sk-or-v1-`)

2. **Update local .env.local file:**
   ```bash
   # In /Users/masa/Clients/Recess/projects/poc/.env.local
   OPENROUTER_API_KEY="your-new-key-here"
   ```

3. **Update Railway environment variable:**
   ```bash
   # Using Railway CLI
   railway variables set OPENROUTER_API_KEY="your-new-key-here"
   
   # Or via Railway dashboard:
   # Go to Variables tab and update OPENROUTER_API_KEY
   ```

4. **Test locally first:**
   ```bash
   npm run dev
   # Visit http://localhost:3000 and test the family parsing
   ```

5. **Deploy to Railway:**
   ```bash
   git add -A
   git commit -m "Update API key configuration"
   git push origin main
   ```

## Important Security Notes
- Never commit API keys to Git
- Always use environment variables
- OpenRouter can detect exposed keys and will revoke them
- Consider setting credit limits on keys for safety
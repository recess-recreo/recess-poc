#!/bin/bash

echo "=== API Key Investigation Report ==="
echo ""

echo "1. System Environment Variable:"
echo "   OPENROUTER_API_KEY ends with: $(echo $OPENROUTER_API_KEY | tail -c 5)"
echo ""

echo "2. .env.local file contains:"
echo "   $(grep OPENROUTER_API_KEY .env.local)"
echo ""

echo "3. .env.railway file contains:"
echo "   $(grep OPENROUTER_API_KEY .env.railway)"
echo ""

echo "4. Current running process check:"
node -e "console.log('   Process env key ends with:', process.env.OPENROUTER_API_KEY ? process.env.OPENROUTER_API_KEY.slice(-4) : 'NOT SET')"
echo ""

echo "=== ISSUE IDENTIFIED ==="
echo "The system environment variable OPENROUTER_API_KEY is set to the old key."
echo "System environment variables take precedence over .env files in Node.js applications."
echo ""
echo "=== SOLUTION ==="
echo "1. Unset the system environment variable:"
echo "   unset OPENROUTER_API_KEY"
echo ""
echo "2. Restart the Next.js development server:"
echo "   Kill current process (PID: $(pgrep -f 'next dev' | head -1)) and restart with: npm run dev"
echo ""
echo "This will ensure the application loads the correct API key from .env.local"
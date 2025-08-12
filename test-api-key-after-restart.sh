#!/bin/bash

echo "=== Post-Restart API Key Verification ==="
echo ""

echo "1. System Environment Check:"
env_key=$(env | grep OPENROUTER_API_KEY || echo "NOT_SET")
if [[ $env_key == "NOT_SET" ]]; then
    echo "   ✅ System environment variable is not set (good)"
else
    echo "   ❌ System environment variable still set: $env_key"
fi
echo ""

echo "2. .env.local file status:"
local_key=$(grep OPENROUTER_API_KEY .env.local)
echo "   📄 $local_key"
if [[ $local_key == *"94bf"* ]]; then
    echo "   ✅ .env.local contains correct key ending in 94bf"
else
    echo "   ❌ .env.local does not contain expected key"
fi
echo ""

echo "3. Node.js Process Environment Test:"
node_result=$(node -e "console.log('PROCESS_ENV_KEY_ENDS_WITH:' + (process.env.OPENROUTER_API_KEY ? process.env.OPENROUTER_API_KEY.slice(-4) : 'NOT_SET'))")
echo "   $node_result"
if [[ $node_result == *"94bf"* ]]; then
    echo "   ✅ Node.js process now loading correct key ending in 94bf"
else
    echo "   ❌ Node.js process still has wrong key or no key"
fi
echo ""

echo "=== SUMMARY ==="
if [[ $env_key == "NOT_SET" ]] && [[ $node_result == *"94bf"* ]]; then
    echo "✅ SUCCESS: API key issue has been resolved!"
    echo "   - System environment variable cleared"
    echo "   - Node.js process loading correct key from .env.local"
    echo "   - Application should now use correct OpenRouter API key"
else
    echo "❌ ISSUE STILL EXISTS: Manual intervention required"
    echo "   - Check if development server needs restart"
    echo "   - Verify no other environment sources are interfering"
fi
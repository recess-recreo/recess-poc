#!/bin/bash

# Recess POC Startup Script
echo "🚀 Starting Recess POC Demo..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  Creating .env.local from template..."
    cp .env.example .env.local
    echo "⚠️  Please edit .env.local with your API keys!"
fi

# Start the development server
echo "🌟 Starting development server..."
echo "📱 Demo will be available at: http://localhost:3000"
echo "🔑 Demo password: recess2024"
echo ""

npm run dev
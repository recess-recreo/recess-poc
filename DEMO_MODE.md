# Demo Mode for AI Family Parsing

This document explains how to use the demo mode feature that bypasses the OpenRouter API for local testing.

## Overview

The demo mode allows you to test the family parsing functionality without a working OpenRouter API key. When enabled, the API will return a realistic mock family profile instead of calling the actual AI service.

## Mock Family Profile

The demo mode returns a profile for:

- **Parent**: Sarah (sarah.demo@example.com)
- **Children**: 
  - Emma (7 years old) - loves art, drawing, painting, crafts
  - Jake (10 years old) - plays soccer, interested in sports and outdoor activities (has nut allergy)
- **Location**: Westlake Hills, Austin, TX 78746
- **Budget**: $200-300 per month per child
- **Schedule**: Weekday afternoons and weekend mornings
- **Activity Types**: Sports, arts, educational, outdoor activities

## How to Enable Demo Mode

### Option 1: Environment Variable (Recommended)

1. Add this to your `.env.local` file:
   ```
   DEMO_MODE=true
   ```

2. Make any POST request to `/api/v1/ai/parse-family` - the demo mode will be active for all requests.

### Option 2: Query Parameter

Add `?demo` to any request URL:
```
POST /api/v1/ai/parse-family?demo
```

## Usage Examples

### With Environment Variable
```bash
# Set in .env.local: DEMO_MODE=true
curl -X POST http://localhost:3000/api/v1/ai/parse-family \
  -H "Content-Type: application/json" \
  -d '{"description": "Any family description here"}'
```

### With Query Parameter
```bash
curl -X POST http://localhost:3000/api/v1/ai/parse-family?demo \
  -H "Content-Type: application/json" \
  -d '{"description": "Any family description here"}'
```

### Using JavaScript/Fetch
```javascript
const response = await fetch('/api/v1/ai/parse-family?demo', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    description: 'Test family description',
  }),
});

const data = await response.json();
console.log(data.familyProfile); // Mock family profile
```

## Response Format

The demo mode returns the same response format as the real API:

```json
{
  "success": true,
  "familyProfile": {
    "adults": [{"name": "Sarah", "email": "sarah.demo@example.com", "role": "parent"}],
    "children": [
      {
        "name": "Emma",
        "age": 7,
        "interests": ["art", "drawing", "painting", "crafts", "creative activities"],
        "allergies": []
      },
      {
        "name": "Jake", 
        "age": 10,
        "interests": ["soccer", "sports", "running", "team activities", "outdoor activities"],
        "allergies": ["nuts"]
      }
    ],
    "location": {
      "neighborhood": "Westlake Hills",
      "city": "Austin",
      "zipCode": "78746",
      "transportationNeeds": false
    },
    "preferences": {
      "budget": {"min": 200, "max": 300, "currency": "USD"},
      "schedule": ["weekday_afternoon", "weekend_morning"],
      "activityTypes": ["sports", "arts", "educational", "outdoor"],
      "languages": ["English"]
    }
  },
  "confidence": 0.95,
  "warnings": ["Demo mode: This is mock data for testing purposes"],
  "usage": {
    "tokensUsed": 0,
    "estimatedCost": 0,
    "model": "demo-mock",
    "cached": false
  }
}
```

## Benefits

- ✅ **No API Key Required**: Test the UI without OpenRouter credentials
- ✅ **Consistent Data**: Same mock profile every time for reliable testing
- ✅ **Zero Cost**: No API charges during development
- ✅ **Fast Response**: Instant responses without network calls
- ✅ **Realistic Data**: Mock profile matches actual expected format

## Disabling Demo Mode

To return to using the real API:

1. Remove `DEMO_MODE=true` from your environment variables, OR
2. Don't include the `?demo` query parameter in requests

## Notes

- The description field in the request body is still validated but ignored in demo mode
- All standard request validation still applies
- The mock profile is hardcoded and doesn't change based on input
- Console logs will indicate when demo mode is active
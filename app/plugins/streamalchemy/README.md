# StreamAlchemy Plugin

Transform TikTok gifts into virtual RPG items with progressive forging mechanics.

## Overview

StreamAlchemy is a comprehensive plugin for "Pup Cid's Little TikTok Helper" that creates an immersive RPG-style item collection and crafting system. When viewers send TikTok gifts, those gifts are transformed into unique virtual items using the gift's icon from TikTok. When viewers send two gifts within 6 seconds, those items automatically combine into crafted items.

## Features

- **Gift-to-Item Transformation**: Every TikTok gift becomes a unique RPG item
- **Gift Icons**: Uses actual TikTok gift images for authentic representation
- **Deterministic Generation**: Items are generated once and cached forever
- **Real-time Crafting**: Send 2 gifts within 6 seconds to trigger crafting
- **Progressive Forging System**: Craft the same combination multiple times to upgrade rarity
  - All crafted items start at Common rarity
  - Every 10 crafts of the same combination forges to next tier
  - Progression: Common → Rare → Legendary → Mythic
- **Rarity Border Frames**: Glowing animated borders inspired by flame-overlay plugin
- **Persistent Inventory**: Track every user's item collection
- **Real-time Overlay**: Beautiful HUD with animations
- **Race-condition Safe**: Serialized requests, atomic database writes

## Rarity System

### Progressive Forging
Unlike traditional crafting where rarity is determined by coin value, StreamAlchemy uses a **progressive forging system**:

1. **First Craft**: All crafted items start at **Common** rarity
2. **Forge Progress**: Each time you craft the same combination, the forge count increases
3. **Tier Upgrade**: After 10 crafts of the same combination, the item forges to the next rarity tier
4. **Max Tier**: Mythic is the highest achievable rarity (requires 30 total crafts: 10 for Rare, 10 for Legendary, 10 for Mythic)

### Visual Effects
- **Common**: Bronze border with gentle glow
- **Rare**: Silver border with pulsing animation
- **Legendary**: Gold border with intense pulsing
- **Mythic**: Purple border with constant radiant glow

## Installation

1. The plugin is already installed in `plugins/streamalchemy/`
2. No API key required (AI generation has been replaced with gift images)
3. Restart the server
4. Add the overlay to OBS:
   - Browser Source URL: `http://localhost:3000/streamalchemy/overlay`
   - Width: 1920, Height: 1080

## Configuration

### Via Environment Variables

```bash
OPENAI_API_KEY=sk-your-openai-api-key
```

### Via API

```javascript
// Get current config
GET /api/streamalchemy/config

// Update config
POST /api/streamalchemy/config
{
  "enabled": true,
  "autoGenerateItems": true,
  "autoCrafting": true,
  "openaiApiKey": "sk-..."
}
```

## API Endpoints

- `GET /streamalchemy/overlay` - Overlay HTML page
- `GET /streamalchemy/style.css` - Overlay CSS
- `GET /api/streamalchemy/config` - Get plugin configuration
- `POST /api/streamalchemy/config` - Update plugin configuration
- `GET /api/streamalchemy/inventory/:userId` - Get user's inventory
- `GET /api/streamalchemy/stats` - Get database and crafting statistics
- `GET /api/streamalchemy/items` - Get all items (global inventory)

## Socket.io Events

### Emitted by Plugin

- `streamalchemy:item_discovery` - New item discovered (first time)
- `streamalchemy:item_increment` - Item quantity increased (repeat)
- `streamalchemy:crafting_start` - Crafting animation begins
- `streamalchemy:crafting_complete` - Crafting finished, new item created

### Received by Plugin

- `streamalchemy:get_inventory` - Request user inventory

## How It Works

### Gift Processing Flow

1. User sends a TikTok gift
2. Plugin checks if this gift ID has an associated item
3. If not, generates a new base item with AI
4. Adds gift to user's 6-second buffer
5. Checks for crafting opportunity

### Crafting Flow

1. User has 2+ gifts in buffer within 6 seconds
2. Takes the two most recent gifts
3. Checks if this combination already exists in database
4. If not, generates a new crafted item with AI
5. Removes both base items from buffer
6. Adds crafted item to user's inventory
7. Triggers overlay animation

### Deterministic Generation

- **Base Items**: Keyed by `giftId` - same gift always produces same item
- **Crafted Items**: Keyed by sorted `[itemAId, itemBId]` - same combination always produces same result
- **Database Lookup**: Always checks before AI generation
- **No Duplicates**: Once generated, items are loaded from database

## Database Structure

### Global Inventory (`data/inventory_global.json`)

```javascript
{
  "items": [
    {
      "itemId": "uuid-v4",
      "giftId": 5655,                    // For base items
      "parentItems": ["uuid1", "uuid2"],  // For crafted items
      "name": "Essence of Rose",
      "rarity": "Common",
      "imageURL": "https://...",
      "isCrafted": false,
      "coinValue": 10,
      "createdAt": "2025-11-23T..."
    }
  ]
}
```

### User Inventory (`data/user_inventory.json`)

```javascript
{
  "userInventories": [
    {
      "userId": "username123",
      "items": [
        {
          "itemId": "uuid-v4",
          "quantity": 5,
          "firstObtained": "2025-11-23T...",
          "lastObtained": "2025-11-23T..."
        }
      ]
    }
  ]
}
```

## Overlay Animations

### Discovery Popup (New Item)
### Discovery Popup (New Item)
- Duration: 5 seconds
- Features: Glow effect, particles, rarity-based border frames, forge progress indicator
- Trigger: First time receiving an item

### Forge Animation (Item Upgraded)
- Duration: 4 seconds
- Features: Anvil animation, intense particle effects, rarity transition display
- Trigger: Crafting same combination 10 times

### Crafting Animation
- Duration: 3 seconds
- Features: Item movement, fusion effect, explosion
- Trigger: Two items combined

### Corner Counter (Repeat)
- Duration: 3 seconds
- Features: Bounce-in, quantity display, rarity glow
- Trigger: Receiving an item you already have

## Rarity System

### Color Schemes

- **Bronze/Common**: Warm bronze glow (#CD7F32)
- **Silver/Rare**: Frost silver glow (#C0C0C0)
- **Gold/Legendary**: Heavy gold glow (#FFD700)
- **Purple/Mythic**: Arcane purple aura (#9370DB)

### Progressive Forging

Unlike coin-based rarity, StreamAlchemy uses a **forge-based progression**:

```javascript
// All crafted items start at Common
firstCraft -> Common (forgeLevel: 0, forgeCount: 1)

// Each subsequent craft of same combination increases forgeCount
craft 2-9 -> Common (forgeCount: 2-9)

// 10th craft forges to Rare
craft 10 -> Rare (forgeLevel: 1, forgeCount resets to 0)

// Continue forging
craft 11-19 -> Rare (forgeCount: 1-9)
craft 20 -> Legendary (forgeLevel: 2)
craft 30 -> Mythic (forgeLevel: 3, max tier)
```

### Database Schema

Items now include forge tracking:
```javascript
{
  itemId: "uuid",
  forgeCount: 5,        // Number of times crafted at current tier
  forgeLevel: 1,        // 0=Common, 1=Rare, 2=Legendary, 3=Mythic
  rarity: "Rare",       // Current rarity name
  isCrafted: true,
  parentItems: ["uuid1", "uuid2"]
}
```

## Performance

- **No AI Costs**: Uses TikTok gift images instead of DALL-E
- **Database**: Atomic writes with LowDB (no race conditions)
- **Overlay**: GPU-accelerated CSS animations (60 FPS)
- **Memory**: Gift buffers auto-cleanup every 30 seconds
- **Rate Limiting**: 30 gifts per user per minute

## Future Features (Prepared Structure)

### Chat Commands
- `/merge itemA itemB` - Manual crafting
- `/inventory` - Show your inventory
- `/alchemy help` - Display help

The command parser structure is ready in `index.js` but not yet implemented.

## Troubleshooting

### Items Show Placeholder Icons

1. Check that gift data includes `giftPictureUrl` field
2. Verify TikTok connection is providing complete gift data
3. Check browser console for image loading errors
4. Placeholder SVG icons are used as fallback when gift images unavailable

### Items Not Appearing in Overlay

1. Verify overlay URL is correct in OBS
2. Check browser console for errors
3. Ensure Socket.io connection is established
4. Check that plugin is enabled

### Crafting Not Triggering

1. Verify two gifts sent within 6 seconds
2. Check `autoCrafting` is enabled in config
3. Check rate limiting isn't blocking gifts
4. View stats endpoint for active buffers

### Forge Not Upgrading

1. Verify you're crafting the exact same combination
2. Check forge count in item details (should reach 10)
3. Ensure item is crafted (base items cannot be forged)
4. Check database for forgeCount and forgeLevel fields

## Development

### File Structure

```
streamalchemy/
├── plugin.json           # Plugin metadata
├── index.js              # Main plugin class
├── config.js             # Configuration constants
├── db.js                 # Database layer (LowDB)
├── craftingService.js    # AI generation and queue
├── overlay.html          # Overlay frontend
├── style.css             # Overlay styles
├── README.md             # This file
└── data/                 # Created at runtime
    ├── inventory_global.json
    └── user_inventory.json
```

### Dependencies

- `openai` - DALL-E 3 API client
- `lowdb` - JSON database
- `uuid` - Unique ID generation
- `express` - HTTP routes
- `socket.io` - Real-time events

## License

CC BY-NC 4.0

## Author

Pup Cid

## Version

1.0.0

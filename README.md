# Atom Network System (discord.js)

Discord bot rebuilt in **Node.js + discord.js** with **slash commands** and **embed-based responses**.

## What was changed

- Migrated from Python to JavaScript (`discord.js`)
- Uses `/` commands (slash commands)
- Added role manager command for both staff/admin role lists with add/remove/list
- Command responses are sent with embeds (not plain text)

## Setup

1. Create `.env` from example and set bot token.
2. Install dependencies.
3. Start bot.

```bash
cp .env.example .env
npm install
npm run start
```

## Environment

- `DISCORD_TOKEN` = your bot token

## Slash commands

### Role selection management
- `/roles scope:staff action:add role:@Role`
- `/roles scope:staff action:remove role:@Role`
- `/roles scope:staff action:list`
- `/roles scope:admin action:add role:@Role`
- `/roles scope:admin action:remove role:@Role`
- `/roles scope:admin action:list`

### Other commands
- `/setchannel kind:<logs|staff_updates|punishments> channel:#channel`
- `/setstaff user:@user rank:<rank> role:@role hire_date:<text>`
- `/stafflist`
- `/usercount`
- `/nitrocount`
- `/kick`
- `/ban`
- `/timeout`
- `/sendembed`
- `/staffupdate`

/* Metallic — mock content. Everything here is demo data for the design concept. */
window.METALLIC = {
  genres: ['All', 'Action', 'RPG', 'Simulator', 'Platformer', 'Racing', 'Survival', 'Strategy', 'Cozy'],

  games: [
    {
      id: 1, title: 'Cyber Raven: Neon Protocol', creator: 'Metallic Studio', genre: 'Action',
      rating: 94, players: 38400, servers: 412, maxPlayers: 64, firstParty: true,
      tags: ['PvP', 'Neon', 'Ranked', 'Controller'],
      desc: 'A vertical arena shooter set on a rain-soaked megastructure. Sixteen players, one collapsing tower, and a ranked ladder that never hides its numbers.',
      art: 'radial-gradient(120% 120% at 16% 8%, rgba(124,58,237,.95), transparent 58%), radial-gradient(90% 90% at 88% 92%, rgba(34,211,238,.6), transparent 62%), linear-gradient(145deg,#1b1533,#0b0912)'
    },
    {
      id: 2, title: 'Metallic Obby Sprint', creator: 'Metallic Studio', genre: 'Platformer',
      rating: 95, players: 8900, servers: 96, maxPlayers: 32, firstParty: true,
      tags: ['Obby', 'Speedrun', 'Co-op', 'Mobile'],
      desc: 'A precision obstacle course with server-verified timing, ghost replays, and weekly community-made routes.',
      art: 'radial-gradient(120% 120% at 20% 12%, rgba(74,222,128,.85), transparent 58%), radial-gradient(90% 90% at 85% 88%, rgba(94,234,212,.55), transparent 62%), linear-gradient(145deg,#0f2a22,#080d10)'
    },
    {
      id: 3, title: 'Rift Hunters', creator: 'Metallic Studio', genre: 'RPG',
      rating: 89, players: 11800, servers: 180, maxPlayers: 24, firstParty: true,
      tags: ['Co-op', 'Loot', 'Dungeons'],
      desc: 'Four-player rift runs with deterministic loot tables, so the drop rate you read is the drop rate you get.',
      art: 'radial-gradient(120% 120% at 82% 10%, rgba(236,72,153,.8), transparent 58%), radial-gradient(90% 90% at 12% 92%, rgba(167,139,250,.6), transparent 62%), linear-gradient(145deg,#2a1030,#0b0912)'
    },
    {
      id: 4, title: 'Obsidian Arena PvP', creator: 'Nightforge', genre: 'Action',
      rating: 88, players: 14200, servers: 240, maxPlayers: 32, firstParty: false,
      tags: ['PvP', 'Tournament', 'Controller'],
      desc: 'Round-based arena combat with a spectator-first layout and a published hit-registration budget.',
      art: 'radial-gradient(120% 120% at 18% 14%, rgba(251,113,133,.75), transparent 56%), radial-gradient(90% 90% at 84% 90%, rgba(99,102,241,.55), transparent 62%), linear-gradient(145deg,#241018,#0a0910)'
    },
    {
      id: 5, title: 'Void Crafters 3D', creator: 'Hollowlight', genre: 'Simulator',
      rating: 92, players: 22400, servers: 320, maxPlayers: 48, firstParty: false,
      tags: ['Building', 'Creative', 'Co-op'],
      desc: 'Voxel construction with a shared blueprint library and versioned saves, so a bad rollback never costs you a build.',
      art: 'radial-gradient(120% 120% at 14% 10%, rgba(99,102,241,.85), transparent 58%), radial-gradient(90% 90% at 86% 88%, rgba(56,189,248,.5), transparent 62%), linear-gradient(145deg,#141a33,#080a12)'
    },
    {
      id: 6, title: 'Raven Blox RP City', creator: 'Northline', genre: 'RPG',
      rating: 91, players: 19100, servers: 260, maxPlayers: 64, firstParty: false,
      tags: ['Roleplay', 'Social', 'Voice'],
      desc: 'A persistent city roleplay server with verified voice, job systems, and a landlord economy you can audit.',
      art: 'radial-gradient(120% 120% at 22% 10%, rgba(20,184,166,.8), transparent 58%), radial-gradient(90% 90% at 88% 90%, rgba(251,191,36,.45), transparent 62%), linear-gradient(145deg,#0e2624,#080d10)'
    },
    {
      id: 7, title: 'Starship Flight Sim', creator: 'Orbital Nine', genre: 'Simulator',
      rating: 86, players: 5300, servers: 74, maxPlayers: 16, firstParty: false,
      tags: ['Flight', 'Realism', 'Co-op'],
      desc: 'Instrument-accurate flight with headless simulation ticks and replayable telemetry for every landing.',
      art: 'radial-gradient(120% 120% at 80% 14%, rgba(56,189,248,.8), transparent 58%), radial-gradient(90% 90% at 10% 90%, rgba(129,140,248,.55), transparent 62%), linear-gradient(145deg,#0d1b2c,#080a12)'
    },
    {
      id: 8, title: 'City of Ashfall', creator: 'Pale Signal', genre: 'Survival',
      rating: 90, players: 7400, servers: 118, maxPlayers: 40, firstParty: false,
      tags: ['Survival', 'Co-op', 'Crafting'],
      desc: 'A burnt-out city where heat, water and daylight are the real currencies. Servers persist for 30 days, then archive.',
      art: 'radial-gradient(120% 120% at 18% 12%, rgba(251,191,36,.75), transparent 56%), radial-gradient(90% 90% at 86% 90%, rgba(120,113,108,.6), transparent 62%), linear-gradient(145deg,#241a10,#0b0909)'
    },
    {
      id: 9, title: 'Neon Drift Circuit', creator: 'Apex Loop', genre: 'Racing',
      rating: 87, players: 9600, servers: 132, maxPlayers: 20, firstParty: false,
      tags: ['Racing', 'PvP', 'Mobile'],
      desc: 'Momentum racing with a 60-tick input buffer and a hard rule: cosmetic-only cars, no stat advantages.',
      art: 'radial-gradient(120% 120% at 84% 12%, rgba(244,114,182,.8), transparent 58%), radial-gradient(90% 90% at 12% 88%, rgba(167,139,250,.55), transparent 62%), linear-gradient(145deg,#2b0f26,#0b0912)'
    },
    {
      id: 10, title: 'Deepwater Survival', creator: 'Nightforge', genre: 'Survival',
      rating: 90, players: 16300, servers: 210, maxPlayers: 48, firstParty: false,
      tags: ['Survival', 'Crafting', 'Co-op'],
      desc: 'Ocean survival with a living tide system. Every server shows its resource budget before you join.',
      art: 'radial-gradient(120% 120% at 16% 10%, rgba(6,182,212,.8), transparent 58%), radial-gradient(90% 90% at 88% 92%, rgba(45,212,191,.5), transparent 62%), linear-gradient(145deg,#0a2230,#070d12)'
    },
    {
      id: 11, title: 'Skyforge Tycoon', creator: 'Northline', genre: 'Simulator',
      rating: 85, players: 6800, servers: 88, maxPlayers: 32, firstParty: false,
      tags: ['Tycoon', 'Idle', 'Building'],
      desc: 'Build a floating forge, price your alloy, and watch the ledger. Offline progress is capped, never sold back to you.',
      art: 'radial-gradient(120% 120% at 82% 14%, rgba(167,139,250,.85), transparent 58%), radial-gradient(90% 90% at 14% 90%, rgba(251,191,36,.45), transparent 62%), linear-gradient(145deg,#1d1633,#0a0912)'
    },
    {
      id: 12, title: 'Hollow Night Tactics', creator: 'Pale Signal', genre: 'Strategy',
      rating: 88, players: 4100, servers: 62, maxPlayers: 8, firstParty: false,
      tags: ['Turn-based', 'Ranked', 'Crossplay'],
      desc: 'Small-scale tactics on a hex grid with full replay history and a transparent matchmaking rating.',
      art: 'radial-gradient(120% 120% at 18% 12%, rgba(16,185,129,.8), transparent 58%), radial-gradient(90% 90% at 86% 90%, rgba(129,140,248,.5), transparent 62%), linear-gradient(145deg,#0d241c,#080b10)'
    },
    {
      id: 13, title: 'Pixel Farmstead', creator: 'Orbital Nine', genre: 'Cozy',
      rating: 93, players: 12700, servers: 164, maxPlayers: 16, firstParty: false,
      tags: ['Cozy', 'Farming', 'Social'],
      desc: 'A slow farm simulator with shared plots, seasonal events, and zero timers you can pay to skip.',
      art: 'radial-gradient(120% 120% at 20% 12%, rgba(132,204,22,.8), transparent 58%), radial-gradient(90% 90% at 84% 88%, rgba(250,204,21,.45), transparent 62%), linear-gradient(145deg,#1a2a10,#090d08)'
    },
    {
      id: 14, title: 'Iron Vanguard', creator: 'Apex Loop', genre: 'Action',
      rating: 84, players: 3200, servers: 52, maxPlayers: 24, firstParty: false,
      tags: ['PvE', 'Squad', 'Loot'],
      desc: 'Squad-based mech combat with a fixed stat budget per frame, so skill beats store-bought armour.',
      art: 'radial-gradient(120% 120% at 16% 10%, rgba(249,115,22,.8), transparent 56%), radial-gradient(90% 90% at 88% 90%, rgba(148,163,184,.5), transparent 62%), linear-gradient(145deg,#2a160d,#0a0908)'
    }
  ],

  servers: [
    { name: 'US-East #01', gameId: 1, region: 'US', ping: 16, players: 62, limit: 64 },
    { name: 'US-West #04', gameId: 1, region: 'US', ping: 38, players: 54, limit: 64 },
    { name: 'EU-Central #02', gameId: 4, region: 'EU', ping: 22, players: 32, limit: 32 },
    { name: 'Asia-East #01', gameId: 6, region: 'ASIA', ping: 84, players: 61, limit: 64 },
    { name: 'US-South #03', gameId: 5, region: 'US', ping: 28, players: 41, limit: 48 },
    { name: 'EU-North #01', gameId: 7, region: 'EU', ping: 31, players: 12, limit: 16 },
    { name: 'US-East #07', gameId: 2, region: 'US', ping: 19, players: 28, limit: 32 },
    { name: 'EU-West #05', gameId: 10, region: 'EU', ping: 26, players: 44, limit: 48 },
    { name: 'Asia-South #02', gameId: 9, region: 'ASIA', ping: 71, players: 17, limit: 20 },
    { name: 'US-Central #06', gameId: 13, region: 'US', ping: 33, players: 14, limit: 16 },
    { name: 'EU-Central #09', gameId: 8, region: 'EU', ping: 24, players: 37, limit: 40 },
    { name: 'US-West #11', gameId: 3, region: 'US', ping: 41, players: 21, limit: 24 }
  ],

  wardrobe: [
    { name: 'Metallic Core Suit', slot: 'suit', rarity: 'Common', color: '#3b2f66' },
    { name: 'Obsidian Plating', slot: 'suit', rarity: 'Rare', color: '#1f2937' },
    { name: 'Aurora Shell', slot: 'suit', rarity: 'Epic', color: '#4c1d95' },
    { name: 'Halo Cap', slot: 'hat', rarity: 'Common', color: '#a78bfa' },
    { name: 'Raven Helm', slot: 'hat', rarity: 'Rare', color: '#7c3aed' },
    { name: 'Signal Crown', slot: 'hat', rarity: 'Legendary', color: '#fbbf24' },
    { name: 'Tactical Visor X', slot: 'face', rarity: 'Rare', color: '#5eead4' },
    { name: 'Neon Lenses', slot: 'face', rarity: 'Common', color: '#22d3ee' },
    { name: 'Obsidian Wings', slot: 'back', rarity: 'Epic', color: '#8b5cf6' },
    { name: 'Drift Pack', slot: 'back', rarity: 'Common', color: '#f472b6' },
    { name: 'Violet Aura Field', slot: 'fx', rarity: 'Epic', color: '#a78bfa' },
    { name: 'Mint Trails', slot: 'fx', rarity: 'Rare', color: '#4ade80' }
  ],

  market: [
    { name: 'Cyber Raven Helm', slot: 'hat', rarity: 'Rare', price: 350, color: '#7c3aed' },
    { name: 'Obsidian Wings', slot: 'back', rarity: 'Epic', price: 600, color: '#8b5cf6' },
    { name: 'Violet Aura Field', slot: 'fx', rarity: 'Epic', price: 450, color: '#a78bfa' },
    { name: 'Tactical Visor X', slot: 'face', rarity: 'Rare', price: 200, color: '#5eead4' },
    { name: 'Shadow Cloak', slot: 'back', rarity: 'Legendary', price: 800, color: '#334155' },
    { name: 'Metallic Armor', slot: 'suit', rarity: 'Legendary', price: 1100, color: '#475569' },
    { name: 'Neon Trail', slot: 'fx', rarity: 'Common', price: 260, color: '#22d3ee' },
    { name: 'Reaver Blade FX', slot: 'fx', rarity: 'Rare', price: 420, color: '#fb7185' },
    { name: 'Drift Pack', slot: 'back', rarity: 'Common', price: 180, color: '#f472b6' },
    { name: 'Signal Crown', slot: 'hat', rarity: 'Legendary', price: 950, color: '#fbbf24' }
  ],

  myGames: [
    { title: 'Cyber Raven: Neon Protocol', players: 38400, revenue: 128400, replicas: 412, maxReplicas: 600, cpu: 62 },
    { title: 'Metallic Obby Sprint', players: 8900, revenue: 21300, replicas: 96, maxReplicas: 200, cpu: 34 },
    { title: 'Rift Hunters', players: 11800, revenue: 44900, replicas: 180, maxReplicas: 300, cpu: 48 }
  ],

  featureGroups: [
    {
      area: 'Accounts & identity', items: [
        { t: 'Secure login', s: 'shipped', p: 'login.html' },
        { t: 'Profiles', s: 'shipped', p: 'profile.html' },
        { t: 'Editable bios', s: 'shipped', p: 'profile.html' },
        { t: 'Link Discord, YouTube, Twitch, TikTok', s: 'shipped', p: 'profile.html' },
        { t: 'Friends', s: 'shipped', p: 'profile.html' },
        { t: 'Achievements', s: 'shipped', p: 'library.html' }
      ]
    },
    {
      area: 'Trust & safety', items: [
        { t: 'Good moderation', s: 'shipped', p: 'safety.html' },
        { t: 'Unverified accounts deleted one month after creation', s: 'shipped', p: 'settings.html' },
        { t: 'Detection of many accounts from the same IP address', s: 'shipped', p: 'safety.html' },
        { t: 'Name sniping is not allowed', s: 'shipped', p: 'safety.html' },
        { t: '5 accounts allowed as alts', s: 'shipped', p: 'profile.html' },
        { t: "A ban on one account bans all of that person's alts", s: 'shipped', p: 'profile.html' }
      ]
    },
    {
      area: 'Scale', items: [
        { t: 'Handle millions of users', s: 'shipped', p: 'features.html' },
        { t: 'Optimisation for scalability', s: 'shipped', p: 'features.html' },
        { t: 'Servers set up on request', s: 'shipped', p: 'servers.html' },
        { t: 'Sandboxed environments with a hard ceiling', s: 'shipped', p: 'servers.html' },
        { t: 'Resource use scaled to connected players', s: 'shipped', p: 'create.html' }
      ]
    },
    {
      area: 'Discovery & library', items: [
        { t: 'Homepage showing featured games', s: 'shipped', p: 'index.html' },
        { t: 'Explore with better, easier categories', s: 'shipped', p: 'explore.html' },
        { t: 'Recommendations by genre and match quality', s: 'shipped', p: 'explore.html' },
        { t: 'Ratings', s: 'shipped', p: 'game.html' },
        { t: 'Play history', s: 'shipped', p: 'library.html' },
        { t: 'Favourites', s: 'shipped', p: 'library.html' },
        { t: 'Our own first-party games', s: 'shipped', p: 'index.html' }
      ]
    },
    {
      area: 'Economy & marketplace', items: [
        { t: 'Money', s: 'shipped', p: 'wallet.html' },
        { t: 'In-game currency (Alloy)', s: 'shipped', p: 'wallet.html' },
        { t: 'Ways to earn free currency', s: 'shipped', p: 'wallet.html' },
        { t: 'Gifts (currency and accessories)', s: 'shipped', p: 'wallet.html' },
        { t: 'Marketplace', s: 'shipped', p: 'marketplace.html' },
        { t: 'Wardrobe', s: 'shipped', p: 'avatar.html' },
        { t: 'Trading', s: 'shipped', p: 'wallet.html' }
      ]
    },
    {
      area: 'Games & servers', items: [
        { t: 'Game management for creators', s: 'shipped', p: 'create.html' },
        { t: 'Server activity', s: 'shipped', p: 'servers.html' },
        { t: 'Live player counts', s: 'shipped', p: 'charts.html' },
        { t: 'In-game server browser', s: 'shipped', p: 'game.html' },
        { t: 'Better server finding', s: 'shipped', p: 'servers.html' }
      ]
    },
    {
      area: 'Community & integrations', items: [
        { t: 'Community / Discord', s: 'shipped', p: 'community.html' },
        { t: 'Deeper Discord integration', s: 'shipped', p: 'community.html' }
      ]
    },
    {
      area: 'Developers & look', items: [
        { t: 'Backend APIs', s: 'shipped', p: 'docs.html' },
        { t: 'API docs', s: 'shipped', p: 'docs.html' },
        { t: 'Themes', s: 'shipped', p: 'settings.html' }
      ]
    }
  ],

  categories: [
    { name: 'Obby & Parkour', match: ['Platformer', 'Obby', 'Speedrun', 'Mobile'], blurb: 'Precision routes, ghost replays, weekly community maps.' },
    { name: 'PvP & arena', match: ['Action', 'PvP', 'Ranked', 'Tournament'], blurb: 'Round-based combat with published hit registration.' },
    { name: 'Roleplay & social', match: ['RPG', 'Roleplay', 'Social', 'Voice'], blurb: 'Persistent cities, jobs, housing and verified voice.' },
    { name: 'Tycoon & building', match: ['Simulator', 'Tycoon', 'Building', 'Idle'], blurb: 'Build it, price it, watch the ledger.' },
    { name: 'Survival & crafting', match: ['Survival', 'Crafting', 'Co-op'], blurb: 'Heat, water and daylight as the real currencies.' },
    { name: 'Racing', match: ['Racing', 'Mobile'], blurb: 'Momentum racing, cosmetic-only cars.' },
    { name: 'Strategy', match: ['Strategy', 'Turn-based', 'Crossplay'], blurb: 'Small lobbies, full replays, honest rating.' },
    { name: 'Cozy', match: ['Cozy', 'Farming', 'Social'], blurb: 'Slow games with no timers you can buy past.' }
  ],

  achievements: [
    { id: 'first', name: 'First steps', desc: 'Play any experience once.', metric: 'plays', target: 1, reward: 50 },
    { id: 'explorer', name: 'Explorer', desc: 'Play 5 different experiences.', metric: 'distinct', target: 5, reward: 200 },
    { id: 'regular', name: 'Regular', desc: 'Start 10 sessions.', metric: 'plays', target: 10, reward: 300 },
    { id: 'critic', name: 'Critic', desc: 'Rate 3 experiences.', metric: 'ratings', target: 3, reward: 150 },
    { id: 'curator', name: 'Curator', desc: 'Favourite 3 experiences.', metric: 'favs', target: 3, reward: 150 },
    { id: 'collector', name: 'Collector', desc: 'Own 5 cosmetics.', metric: 'owned', target: 5, reward: 250 },
    { id: 'patron', name: 'Patron', desc: 'Send a gift to a friend.', metric: 'gifts', target: 1, reward: 100 },
    { id: 'trader', name: 'Trader', desc: 'Complete a trade.', metric: 'trades', target: 1, reward: 100 },
    { id: 'earner', name: 'Earner', desc: 'Claim a free-currency reward.', metric: 'claims', target: 1, reward: 75 },
    { id: 'founder', name: 'Founder', desc: 'Fill in your profile.', metric: 'profile', target: 1, reward: 250 }
  ],

  quests: [
    { id: 'daily', label: 'Daily challenge', detail: 'Start a session in any experience today.', reward: 200 },
    { id: 'obby', label: 'Finish an obby route', detail: 'Complete any parkour course without a respawn.', reward: 250 },
    { id: 'friend', label: 'Play with a friend', detail: 'Join a server a friend is already in.', reward: 150 },
    { id: 'stream', label: 'Watch a creator stream', detail: 'Ten minutes on a linked channel.', reward: 150 },
    { id: 'referral', label: 'Refer a friend', detail: 'They verify their account within 30 days.', reward: 500 }
  ],

  transactions: [
    { what: 'Marketplace sale · Cyber Raven Helm', amount: 333, when: '2 days ago' },
    { what: 'Daily challenge reward', amount: 200, when: '3 days ago' },
    { what: 'Bought Tactical Visor X', amount: -200, when: '5 days ago' },
    { what: 'Gift from NovaFox', amount: 150, when: '1 week ago' },
    { what: 'Creator payout · Rift Hunters', amount: 840, when: '1 week ago' }
  ],

  profile: {
    bio: 'Building neon things. Usually in a ranked queue, occasionally in a rift.',
    joined: 'Joined 14 September 2026',
    socials: [
      { name: 'Discord', handle: 'ravendev', color: '#5865f2' },
      { name: 'YouTube', handle: '@ravendev', color: '#f5372f' },
      { name: 'Twitch', handle: 'ravendev_live', color: '#9146ff' },
      { name: 'TikTok', handle: '@ravendev', color: '#25f4ee' }
    ],
    friends: [
      { name: 'heroX_x', status: 'Playing Cyber Raven', color: '#ffd23f' },
      { name: 'CRIMSONSLAYER', status: 'Online', color: '#2f6b4f' },
      { name: '00RIP_INDRA', status: 'In game · Rift Hunters', color: '#2b7cd3' },
      { name: 'NovaFox', status: 'Online', color: '#f472b6' },
      { name: 'PixelHarbor', status: 'Last seen 1h ago', color: '#22d3ee' },
      { name: 'HexWave', status: 'Offline', color: '#a78bfa' }
    ],
    alts: [
      { name: 'RavenDev', main: true, status: 'Verified' },
      { name: 'RavenDev_Trade', main: false, status: 'Verified' },
      { name: 'RavenDev_Mobile', main: false, status: 'Verified' },
      { name: 'RavenClips', main: false, status: 'Verified' }
    ]
  },

  community: {
    guild: 'Metallic Commons',
    members: 184320,
    online: 21450,
    channels: [
      { name: '#announcements', detail: 'Platform releases, downtime and patch notes.', unread: 2 },
      { name: '#server-status', detail: 'Live incidents from the orchestrator, posted by the bot.', unread: 0 },
      { name: '#creator-hub', detail: 'Publishing help, payout questions, playtest swaps.', unread: 14 },
      { name: '#looking-for-group', detail: 'Party up by region and experience.', unread: 31 }
    ],
    events: [
      { title: 'Rift Hunters: season 4 open', when: 'Fri 20:00 UTC', where: 'Voice stage 2' },
      { title: 'Creator AMA with Pale Signal', when: 'Sat 17:00 UTC', where: '#creator-hub' },
      { title: 'Neon Drift community cup', when: 'Sun 15:00 UTC', where: 'EU-West servers' }
    ],
    integrations: [
      { t: 'Rich presence', d: 'Your Discord status shows the experience and server you are in.', on: true },
      { t: 'Join from Discord', d: 'Friends jump straight into your server from the profile card.', on: true },
      { t: 'Role sync', d: 'Creator, Plus and moderator roles follow your account both ways.', on: true },
      { t: 'Guild linking', d: 'Attach a Discord guild to an experience for announcements.', on: false }
    ]
  },

  themes: [
    { id: 'ink', name: 'Ink', desc: 'Near-black canvas, blue accent. Default.', swatch: ['#0b0b0e', '#3b82f6'] },
    { id: 'violet', name: 'Violet', desc: 'Same ink ladder, violet accent.', swatch: ['#0b0b0e', '#8b5cf6'] },
    { id: 'ember', name: 'Ember', desc: 'Warm accent for late sessions.', swatch: ['#0b0b0e', '#f97316'] },
    { id: 'mint', name: 'Mint', desc: 'Cool green accent, low glare.', swatch: ['#0b0b0e', '#10b981'] }
  ],

  sessions: [
    { device: 'Chrome · Windows 11', where: 'Lisbon, PT', when: 'Active now', current: true },
    { device: 'Metallic mobile · Pixel 8', where: 'Lisbon, PT', when: '2 hours ago', current: false },
    { device: 'Safari · macOS', where: 'Porto, PT', when: 'Yesterday', current: false }
  ],

  listings: [
    { name: 'Obsidian Wings', price: 570, state: 'Live · 3 views' },
    { name: 'Neon Trail', price: 247, state: 'Live · 11 views' }
  ],

  platformScale: [
    { k: 'Peak concurrent', v: '1.4M', d: 'regional shards, 40 per continent' },
    { k: 'Server p99 join', v: '1.8s', d: 'sandbox provisioned on request' },
    { k: 'Read replicas', v: 'Global', d: 'catalogue served from edge cache' },
    { k: 'Writes per account', v: 'Server-side', d: 'client never writes currency' }
  ]
};

// Sample content and client-side discovery for the platform preview.
export const genres = ['Action', 'Adventure', 'Roleplay', 'Obby', 'Simulation', 'Racing'];
// Titles the platform itself ships; they get a studio badge and their own shelf.
export const firstPartyGames = ['1', '5', '11', '13'];
export const isFirstParty = id => firstPartyGames.includes(String(id));
export const cosmeticSlots = ['Hats', 'Shirts', 'Pants', 'Shoes', 'Shoulders', 'Back', 'Neck', 'Face', 'Waist'];
export const creatorTypes = { games: 'Games', models: 'Models & meshes', audio: 'Audio & music', plugins: 'Plugins', cosmetics: 'Cosmetics' };
export const settingsSections = {
  account: ['Account', 'Your profile and account details.'],
  privacy: ['Privacy & safety', 'Choose how you connect with other players.'],
  notifications: ['Notifications', 'Choose what appears in your notification inbox.'],
  discovery: ['Game preferences', 'Help Metallic find games you’ll enjoy.'],
  appearance: ['Themes', 'Choose how Metallic looks on this device.'],
  community: ['Community', 'Connect the places where you already talk to players.'],
  security: ['Security', 'Manage account access when live accounts launch.'],
  data: ['Preview data', 'Manage the data saved in this browser.'],
};
export const gameDetails = {
  '1': { mood: 'Immersive', mode: 'Co-op', tags: ['Exploration', 'Sci-fi', 'Story'] },
  '2': { mood: 'Quick play', mode: 'Solo', tags: ['Parkour', 'Platformer', 'Challenge'] },
  '3': { mood: 'Competitive', mode: 'Co-op', tags: ['Combat', 'Fantasy', 'Teamwork'] },
  '4': { mood: 'Competitive', mode: 'Multiplayer', tags: ['PvP', 'Arena', 'Combat'] },
  '5': { mood: 'Relaxed', mode: 'Co-op', tags: ['Building', 'Sandbox', 'Creative'] },
  '6': { mood: 'Social', mode: 'Multiplayer', tags: ['City', 'Hangout', 'Roleplay'] },
  '7': { mood: 'Immersive', mode: 'Solo', tags: ['Space', 'Flying', 'Exploration'] },
  '8': { mood: 'Immersive', mode: 'Co-op', tags: ['Exploration', 'Survival', 'Story'] },
  '9': { mood: 'Competitive', mode: 'Multiplayer', tags: ['Cars', 'Racing', 'Time trials'] },
  '10': { mood: 'Immersive', mode: 'Co-op', tags: ['Ocean', 'Survival', 'Exploration'] },
  '11': { mood: 'Relaxed', mode: 'Solo', tags: ['Building', 'Tycoon', 'Management'] },
  '12': { mood: 'Competitive', mode: 'Solo', tags: ['Strategy', 'Combat', 'Tactics'] },
  '13': { mood: 'Relaxed', mode: 'Co-op', tags: ['Farming', 'Building', 'Nature'] },
  '14': { mood: 'Competitive', mode: 'Multiplayer', tags: ['Teamwork', 'Combat', 'Arena'] },
};
export function recommendationGenres(catalog, state) {
  const weights = new Map((state.preferredGenres || []).map(genre => [genre, 5]));
  for (const game of catalog.filter(g => state.favorites.includes(g.id))) weights.set(game.genre, (weights.get(game.genre) || 0) + 3);
  return weights;
}
export function recommendGames(catalog, state) {
  const weights = recommendationGenres(catalog, state);
  return catalog.filter(g => !(state.hiddenGames || []).includes(g.id)).map((game, index) => ({ game, index,
    score: (weights.get(game.genre) || 0) * 10 + game.rating / 10 + (state.favorites.includes(game.id) ? -25 : 2),
  })).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.game);
}
export function discoverGames(catalog, state, params) {
  const query = (params.get('q') || '').trim().toLowerCase();
  const category = params.get('category') || 'All';
  const minRating = Number(params.get('rating') || 0);
  const mode = params.get('mode') || 'All';
  const mood = params.get('mood') || 'All';
  const hideFavorites = params.get('unplayed') === '1';
  let result = recommendGames(catalog, state).filter(game => {
    const info = gameDetails[game.id];
    return (!query || `${game.title} ${game.genre} ${info.tags.join(' ')}`.toLowerCase().includes(query))
      && (category === 'All' || game.genre === category) && game.rating >= minRating
      && (mode === 'All' || info.mode === mode) && (mood === 'All' || info.mood === mood)
      && (!hideFavorites || !state.favorites.includes(game.id));
  });
  const sort = params.get('sort');
  if (sort === 'rating') result.sort((a, b) => b.rating - a.rating);
  if (sort === 'players') result.sort((a, b) => parseFloat(b.playing) - parseFloat(a.playing));
  if (sort === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
  return result;
}
export const connections = {
  heroX_x: ['CRIMSONSLAYER', '00RIP_INDRA', 'LunaBlocks'],
  CRIMSONSLAYER: ['heroX_x', '00RIP_INDRA', 'CloudBuilder'],
  '00RIP_INDRA': ['heroX_x', 'CRIMSONSLAYER', 'OrbitKai'],
  PixelNova: ['CloudBuilder', 'LunaBlocks', 'NeonFox'],
  CloudBuilder: ['PixelNova', 'CRIMSONSLAYER'],
  LunaBlocks: ['PixelNova', 'heroX_x'], NeonFox: ['PixelNova'], OrbitKai: ['00RIP_INDRA'],
};
export function mutualFriends(state, name) {
  return [...new Set(connections[name] || [])].filter(friend => friend !== name && friend !== state.profile.name && state.friends.includes(friend));
}
export const sampleFavorites = { heroX_x: ['1', '3', '4'], CRIMSONSLAYER: ['4', '14'], '00RIP_INDRA': ['3', '8'], PixelNova: ['5', '13'], CloudBuilder: ['5', '11'], LunaBlocks: ['6', '13'], NeonFox: ['9'], OrbitKai: ['7'] };
export const badges = [
  { name: 'First steps', description: 'A place to begin.', icon: 'explore' },
  { name: 'World builder', description: 'Big ideas start small.', icon: 'create' },
  { name: 'Better together', description: 'Find your people.', icon: 'friends' },
];
export const marketplaceAssets = [
  { id: 'city-kit', name: 'Modular City Kit', type: 'models', subcategory: 'Models', price: 480, creator: 'CloudBuilder', description: 'A modular starting point for streets, storefronts, and a city of your own.', color: 'blue' },
  { id: 'nature-kit', name: 'Pinewood Nature Pack', type: 'models', subcategory: 'Meshes', price: 320, creator: 'PixelNova', description: 'A collection of stylized trees, rocks, and foliage for outdoor worlds.', color: 'green' },
  { id: 'sci-door', name: 'Sci-fi Door Kit', type: 'models', subcategory: 'Models', price: 180, creator: 'OrbitKai', description: 'Door frames and panels to bring a space station together.', color: 'purple' },
  { id: 'city-loops', name: 'Midnight City Loops', type: 'audio', subcategory: 'Music', price: 150, creator: 'NeonFox', description: 'A set of atmospheric music loops for the city after dark.', color: 'purple' },
  { id: 'forest-sound', name: 'Forest Ambience', type: 'audio', subcategory: 'Ambience', price: 0, creator: 'LunaBlocks', description: 'A calm backdrop for woodland adventures and peaceful corners.', color: 'green' },
  { id: 'align-tools', name: 'Studio Align Tools', type: 'plugins', subcategory: 'Studio tools', price: 95, creator: 'CloudBuilder', description: 'An alignment-tool concept for a faster building workflow.', color: 'blue' },
  { id: 'terrain-painter', name: 'Terrain Painter', type: 'plugins', subcategory: 'Utilities', price: 200, creator: 'PixelNova', description: 'A terrain-painting tool concept for shaping your next landscape.', color: 'amber' },
  { id: 'signal-cap', name: 'Signal Cap', type: 'cosmetics', subcategory: 'Hats', price: 75, creator: 'NeonFox', description: 'A clean everyday cap with a little Metallic character.', color: 'purple' },
  { id: 'grid-shirt', name: 'Gridline Tee', type: 'cosmetics', subcategory: 'Shirts', price: 40, creator: 'PixelNova', description: 'A simple graphic tee for your next look.', color: 'blue' },
  { id: 'cargo-pants', name: 'Cargo Runner Pants', type: 'cosmetics', subcategory: 'Pants', price: 50, creator: 'LunaBlocks', description: 'Ready-for-anything cargo styling.', color: 'green' },
  { id: 'orbit-shoes', name: 'Orbit Sneakers', type: 'cosmetics', subcategory: 'Shoes', price: 60, creator: 'OrbitKai', description: 'A fresh pair for exploring new worlds.', color: 'amber' },
  { id: 'scout-bot', name: 'Scout Shoulder Bot', type: 'cosmetics', subcategory: 'Shoulders', price: 120, creator: 'CloudBuilder', description: 'A little companion for your avatar’s shoulder.', color: 'blue' },
  { id: 'explorer-pack', name: 'Explorer Pack', type: 'cosmetics', subcategory: 'Back', price: 80, creator: 'LunaBlocks', description: 'Pack for whatever comes next.', color: 'green' },
  { id: 'silver-chain', name: 'Silver Chain', type: 'cosmetics', subcategory: 'Neck', price: 35, creator: 'NeonFox', description: 'A subtle finishing touch in silver.', color: 'purple' },
];
export function assetMatches(asset, params) {
  const query = (params.get('q') || '').toLowerCase().trim();
  return (!params.get('type') || asset.type === params.get('type'))
    && (!params.get('slot') || asset.subcategory === params.get('slot'))
    && (params.get('price') !== 'free' || asset.price === 0)
    && (params.get('price') !== 'paid' || asset.price > 0)
    && (!query || `${asset.name} ${asset.subcategory} ${asset.creator || ''}`.toLowerCase().includes(query));
}

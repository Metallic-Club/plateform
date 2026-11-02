import { games } from './catalog.js';
import { searchSite } from './search.js';
import { presenceFor } from './presence.js';
import { loadState, saveState, filterGames, updateFriendship, outfits, accessories, colors, templates, escapeHtml as esc } from './store.js';
import { readRoute, routeWithParams, categories, friendTabs } from './router.js';
import { portrait, community, personInfo } from './avatar.js';
import { SERVER_PRICE, groupRole, groupsForProfile, friendActivity, groupCategories, getGroups, findGroup, groupMembers, ownerForGame, friendsPlaying, friendSessions, sampleServers, serverAccess, friendJoinAccess, createServerPreview, reservedServerCards, updateGroupMembership } from './social.js';
import { genres, cosmeticSlots, creatorTypes, settingsSections, gameDetails, recommendGames, recommendationGenres, discoverGames, connections, mutualFriends, sampleFavorites, badges, marketplaceAssets, assetMatches, firstPartyGames, isFirstParty } from './platform.js';
import { themes, applyTheme, isTheme } from './theme.js';
import { recordPlay } from './play.js';
import { DAILY_REWARD, canClaimDaily, claimDaily, sendGift, giftItem } from './economy.js';
import { proposeTrade, acceptTrade, cancelTrade, pendingTrades } from './trade.js';
import { QUESTS, claimQuest, questProgress, weekKey } from './quests.js';

let storage;
try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw Error('Unavailable'); } }; }
let state = loadState(storage);
let route, params, category = 'All', sort = 'recommended', friendTab = 'All friends', wardrobeTab = 'Outfits', platform = 'Windows';
let draftOutfit = state.outfit, draftColor = state.color, draftAccessory = state.accessory;
let avatarBack = false, settingsDirty = false, notificationsOpen = false;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
  wardrobe: '<path d="m8 3 4 3 4-3 6 5-4 4-2-2v11H8V10l-2 2-4-4z"/>',
  create: '<path d="M12 3v18M3 12h18"/>',
  alloy: '<path d="m12 2 9 5v10l-9 5-9-5V7zM12 7l4 2v6l-4 2-4-2V9z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  friends: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 4 5"/>',
  settings: '<path d="m9 3-1 3-3 1v4l2 1-2 2v4l3 1 1 3h6l1-3 3-1v-4l-2-2 2-1V7l-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0v6l-2 4h16l-2-4zM10 21h4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15s13-10 8-15z"/>',
  play: '<path d="m8 4 13 8-13 8z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  thumbs: '<path d="M7 10v11H3V10zM7 10l5-7c2 0 3 1 2 4l-1 3h6q3 0 2 4l-2 7H7"/>',
  rotate: '<path d="M4 10a8 8 0 1 1 1 8M4 3v7h7"/>',
  share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9"/>',
  crown: '<path d="m3 6 5 4 4-6 4 6 5-4-2 13H5zM6 22h12"/>',
  groups: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 15a5 5 0 0 1 6 5v1"/>',
  marketplace: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 11h18M8 7V4h8v3M9 15h6"/>',
  models: '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
  audio: '<path d="M9 18V5l12-3v13M9 9l12-3"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="15" rx="3" ry="3"/>',
  plugins: '<path d="M8 3v5m8-5v5M5 8h14v4a7 7 0 0 1-14 0zM12 19v3"/>',
  filter: '<path d="M3 6h18M6 12h12M9 18h6"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/>',
  badge: '<circle cx="12" cy="9" r="6"/><path d="m8 14-2 8 6-3 6 3-2-8M10 9l2 2 3-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  docs: '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6"/>',
  safety: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  community: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6M21 21v-2a5 5 0 0 0-3-4"/>',
  trade: '<path d="M4 8h13l-4-4M20 16H7l4 4"/>',
};
function icon(name, size = 20) { return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.explore}</svg>`; }
function presenceDot(name) {
  const status=presenceFor(state,name);
  return `<i class="presence ${status.key}" role="img" aria-label="${status.label}" title="${status.label}"></i>`;
}
const brand = () => `<a class="brand" href="${['','login','signup'].includes(route)?'#/':'#/home'}"><span class="brand-glyph">M</span><span class="brand-word">Metallic</span></a>`;
const referenceAvatar = (index = 0, cls = '') => `<img class="avatar ${cls}" src="art/avatar-${index % 4}.svg" alt="" width="72" height="72">`;
const avatar = (index = 0, cls = '') => index === 0 ? portrait(state, cls) : referenceAvatar(index, cls);
const link = (to, text, cls = 'button primary') => `<a class="${cls}" href="#/${to}">${text}</a>`;
const button = (action, text, cls = 'button', extra = '') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
function persist(message) { const saved = saveState(storage, state); toast(saved ? message : `${message} for this visit. Browser storage is unavailable.`); }
let toastTimer;
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 4000); }
function modal(title, body) { dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${button('close-dialog', icon('close'), 'plain-icon', 'aria-label="Close dialog"')}</div>${body}`; if (!dialog.open) dialog.showModal(); }
const pageHead = (title, subtitle, action = '') => `<div class="page-head"><div><h1>${title}</h1><p class="welcome">${subtitle}</p></div>${action}</div>`;
const empty = (title, text, action = '') => `<div class="empty-state">${icon('explore', 36)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
function card(game) {
  return `<a class="game-card" href="#/game/${game.id}" aria-label="${esc(game.title)}">
    <span class="game-art"><img class="poster-art" src="${game.art}" alt="" loading="lazy" width="240" height="240">
      <span class="game-genre">${game.genre}</span>${isFirstParty(game.id)?'<span class="studio-flag">Metallic</span>':''}<span class="game-play">${icon('play', 18)}</span>
      ${state.favorites.includes(game.id) ? `<span class="saved-marker" title="Saved to favorites">${icon('heart',13)}</span>` : ''}
    </span><span class="game-title">${esc(game.title)}</span>
    <span class="game-stats"><span class="stat-rating" aria-label="${game.rating} percent liked">${icon('thumbs',13)} ${game.rating}%</span><span aria-label="${esc(game.playing)} playing">${icon('profile',13)} ${esc(game.playing)}</span></span>
  </a>`;
}
function shelf(title, subtitle, items, id, destination = 'explore') {
  return `<section class="home-section"><div class="section-top"><div><h2>${title}</h2>${subtitle ? `<p class="section-sub">${subtitle}</p>` : ''}</div>
    <div class="section-actions">${link(destination,'See all '+icon('arrow',15),'view-all')}
    <div class="shelf-controls">${button('scroll','‹','slide-btn',`data-target="${id}" data-direction="-1" aria-label="Scroll ${title} left"`)}${button('scroll','›','slide-btn',`data-target="${id}" data-direction="1" aria-label="Scroll ${title} right"`)}</div></div></div>
    <div class="card-scroller" id="${id}" tabindex="0" role="region" aria-label="${title} games">${items.map(card).join('')}</div></section>`;
}
function navItem(id, label) { return `<a class="side-link ${(route === id || route.startsWith(id+'/')) ? 'active' : ''}" href="#/${id}" ${(route === id || route.startsWith(id+'/')) ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span>${id === 'friends' && state.requests.length ? `<span class="nav-count">${state.requests.length}</span>` : ''}</a>`; }
function shell(content, publicPage = false) {
  const primary=[['home','Home'],['explore','Explore'],['create','Create'],['wardrobe','Wardrobe'],['marketplace','Marketplace']];
  const mainNav=primary.map(([id,label])=>`<a href="#/${id}" class="${route===id?'active':''}" ${route===id?'aria-current="page"':''}>${label}</a>`).join('');
  const unread=notificationItems().filter(item=>!state.readNotifications.includes(item.id)).length;
  return `<header class="topbar">${!publicPage?button('menu',icon('menu'),'mobile-menu','aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false"'):''}${brand()}
    <nav class="topnav" aria-label="Main navigation">${mainNav}</nav>
    ${!publicPage?`<form class="top-search" id="search-form" role="search">${icon('search',18)}<input id="site-search" name="q" type="search" placeholder="Search games, people, groups" aria-label="Search games, people, and groups" value="${esc(route==='search'?params.get('q')||'':'')}" autocomplete="off" aria-controls="search-suggestions" aria-expanded="false"><button class="search-submit" type="submit" aria-label="Search">${icon('arrow',16)}</button><div id="search-suggestions" hidden aria-label="Search suggestions"></div></form>
    <div class="top-actions">${button('notifications',icon('bell')+(unread?'<span class="notification-dot"></span>':''),'plain-icon','id="notification-toggle" aria-label="Notifications" aria-controls="notification-popover" aria-expanded="false"')}<a href="#/alloy" class="wallet" title="Preview Alloy balance">${icon('alloy',19)}<span>${state.previewAlloy.toLocaleString()}</span></a><a href="#/profile" class="top-profile" aria-label="View your profile">${avatar()}<span class="username">${esc(state.profile.name)}</span></a></div>`:`<div class="top-actions">${link('login','Log in','button quiet')}${link('signup','Sign up','button primary')}</div>`}</header>
    ${!publicPage?`<section id="notification-popover" class="notification-popover" role="region" aria-label="Notification inbox" hidden></section><button class="mobile-backdrop" data-action="menu" aria-label="Close navigation"></button>
    <aside class="sidebar" id="sidebar"><span class="side-section-label">COMMUNITY</span><nav class="nav-group" aria-label="Community navigation">${navItem('friends','Friends')}${navItem('groups','Groups')}${navItem('community','Community')}</nav><span class="side-section-label">YOUR ACCOUNT</span><nav class="nav-group" aria-label="Account navigation">${navItem('trades','Trading')}${navItem('alloy','Buy Alloy')}${navItem('settings','Settings')}</nav><span class="side-section-label">METALLIC</span><nav class="nav-group" aria-label="Platform tools">${navItem('download','Download')}${navItem('docs','API docs')}${navItem('safety','Safety')}</nav><div class="sidebar-bottom"><div class="premium-box"><div class="premium-title">${icon('download',17)} Your next adventure</div><p>Get the latest on the Metallic launcher.</p>${link('download','Launcher availability','premium-link')}</div><a class="sidebar-about" href="#/">About Metallic ${icon('arrow',14)}</a></div></aside>`:''}
    <main id="main" tabindex="-1" class="${publicPage?'public-page':'page'}"><div class="${publicPage?'public-content':'content'}">${content}<footer class="footer"><span>© ${new Date().getFullYear()} Metallic <span class="demo-label">Platform preview · Sample content</span></span><div class="footer-links">${link('','About','')}${link('download','Download','')}${link('marketplace','Marketplace','')}${link('settings','Settings','')}</div></footer></div></main>`;
}
function landing() {
  const mosaic=[...new Map(games.map(game=>[game.genre,game])).values()].slice(0,4);
  const studioCount=games.filter(game=>isFirstParty(game.id)).length;
  return `<section class="landing-hero">
    <div class="hero-copy"><span class="eyebrow"><span class="live-dot"></span> Preview build · sample catalog</span>
      <h1>Pick a world.<br>Make it yours.</h1>
      <p>${games.length} sample games, an avatar studio, and a creator hub. Everything here runs in your browser, so you can look around before you decide anything.</p>
      <form class="hero-search" id="landing-search" role="search">${icon('search',18)}<input type="search" name="q" placeholder="Search worlds, genres, or people" aria-label="Search worlds, genres, or people" autocomplete="off"><button type="submit" class="button primary">Search</button></form>
      <nav class="hero-genres" aria-label="Browse by genre">${categories.filter(name=>name!=='All').map(name=>`<a href="#/explore?category=${encodeURIComponent(name)}">${name}</a>`).join('')}</nav>
      <div class="button-row">${link('signup','Join Metallic '+icon('arrow',18))}${link('explore','Look around','button quiet')}</div>
      <small>No account needed to browse. Nothing is stored until you choose something.</small></div>
    <div class="hero-mosaic">${mosaic.map(game=>`<a href="#/game/${game.id}"><img src="${game.art}" alt="${esc(game.title)}" width="240" height="240" loading="lazy"><span>${esc(game.title)}<small>${game.genre}</small></span></a>`).join('')}<div class="mosaic-caption">Four of ${games.length} sample worlds. <span>Made for this preview.</span></div></div></section>
    <section class="landing-facts" aria-label="What is here">
      <a href="#/explore"><strong>${games.length}</strong><span>sample worlds to open</span></a>
      <a href="#/explore"><strong>${studioCount}</strong><span>built by Metallic Studio</span></a>
      <a href="#/explore"><strong>${categories.length-1}</strong><span>genres to browse</span></a>
    </section>
    <section class="landing-intro"><span class="eyebrow">START SOMEWHERE</span><h2>Three ways in.</h2>
      <div class="start-steps">
        <a href="#/explore"><span class="step-num">01</span><h3>Open a world</h3><p>Sort by players or rating, filter by genre, and open anything that looks interesting. Your play history keeps the last few in reach.</p><span class="step-link">Explore games →</span></a>
        <a href="#/wardrobe"><span class="step-num">02</span><h3>Make an avatar</h3><p>Layer outfits, pick a colour, and add an accessory. Changes stay in this browser until you reset the preview.</p><span class="step-link">Open the wardrobe →</span></a>
        <a href="#/create"><span class="step-num">03</span><h3>Build something</h3><p>Draft a project, keep a list of assets, and read how the creator marketplace takes a listing from idea to sale.</p><span class="step-link">Visit the creator hub →</span></a>
      </div>
    </section>
    ${shelf('A little inspiration','A first look at the worlds of Metallic',games.slice(0,6),'landing-games')}
    ${shelf('Built by Metallic Studio','In-house sample worlds, free to open',games.filter(game=>isFirstParty(game.id)),'landing-studio','explore')}
    <section class="cta-panel"><div><span class="eyebrow">READY WHEN YOU ARE</span><h2>Come for a game. Stay for the people.</h2><p>Groups, friends, trading, and weekly quests are all here to try. No email, no card, no live account.</p></div><div class="button-row">${link('signup','Pick a name')}${link('home','Explore the platform','button quiet')}</div></section>`;
}

function friendStrip() {
  return `<section class="home-section friends-section"><div class="section-top"><h2>Friends <span class="muted">(${state.friends.length})</span></h2>${link('friends','See all '+icon('arrow',15),'view-all')}</div>
    <div class="friends-list"><a class="friend" href="#/friends?tab=find"><span class="friend-picture add">${icon('create',28)}</span><span class="friend-name">Add friends</span><span class="friend-activity">Find your people</span></a>
    ${state.friends.map(name => { const person=personInfo(name), activity=friendActivity(state,name); return `<div class="friend home-friend-preview" data-friend-preview="${esc(name)}"><a class="friend-profile" href="#/profile?user=${encodeURIComponent(name)}"><span class="friend-picture">${referenceAvatar(person.avatar)}${presenceDot(name)}</span><span class="friend-name">${esc(name)}</span></a><button type="button" class="friend-activity activity-trigger" data-action="friend-preview" aria-label="See activity for ${esc(name)}" aria-controls="friend-activity-popover" aria-expanded="false">${activity?'In game':esc(person.activity)} ${icon('arrow',10)}</button></div>`; }).join('')}</div>
    <div id="friend-activity-popover" class="friend-activity-popover" popover="manual" role="region" aria-label="Friend activity"></div></section>`;
}
function home() {
  const favorites = games.filter(g => state.favorites.includes(g.id));
  return `${pageHead('Home',`Welcome back, ${esc(state.profile.name)}`,link('wardrobe',avatar()+' Customize avatar','avatar-shortcut'))}
    ${friendStrip()}
    ${dailyRewardStrip()}
    ${playHistory().length?historyShelf():shelf('Continue','Pick up where you left off',games.slice(0,6),'continue')}
    ${!state.launcherDismissed ? `<div class="launcher-strip"><span>${icon('download')}<span><strong>Take Metallic with you</strong><small>Get the latest on the launcher.</small></span></span><div>${link('download','View launcher','button small')}${button('dismiss-launcher',icon('close',16),'plain-icon','aria-label="Dismiss launcher notice"')}</div></div>` : ''}
    ${favorites.length ? shelf('Favorite games','Always worth coming back to',favorites,'favorites','profile') : ''}
    <section class="home-section"><div class="section-top"><div><h2>Recommended for you</h2><p class="section-sub">A new favorite is just around the corner</p></div>${link('explore','See all '+icon('arrow',15),'view-all')}</div>
    ${filters()}<div class="game-grid" id="game-results">${filterGames(recommendGames(games,state),'',category).slice(0,12).map(card).join('')}</div></section>
    ${shelf('From Metallic Studio','Built in-house and free to play',games.filter(game=>isFirstParty(game.id)),'studio','explore')}
    ${shelf('Popular right now','Find out what everyone is exploring',filterGames(games,'','All','players').slice(0,8),'popular','explore?sort=players')}
    ${shelf('Top rated','Community favorites',filterGames(games,'','All','rating').slice(0,8),'top-rated','explore?sort=rating')}`;
}
function filters() {
  return `<div class="discover-bar"><div class="categories" role="group" aria-label="Game categories">${categories.map(c=>button('category',c==='All'?'For you':c,`cat ${category===c?'selected':''}`,`data-value="${c}" aria-pressed="${category===c}"`)).join('')}</div></div>`;
}
function explore() {
  const query=params.get('q')||'', ranked=recommendGames(games,state), weights=recommendationGenres(games,state);
  const interest=[...weights].sort((a,b)=>b[1]-a[1]).find(([genre])=>ranked.some(game=>game.genre===genre))?.[0];
  const filtered=['q','category','mood','mode','rating','unplayed'].some(key=>params.get(key)&&params.get(key)!=='All');
  const results=discoverGames(games,state,params), feature=ranked.find(g=>!state.favorites.includes(g.id))||ranked[0];
  const related=interest?ranked.filter(game=>game.genre===interest):ranked.filter(game=>gameDetails[game.id].mood==='Immersive');
  const filterFields=[['category','Genre',['All',...genres]],['mood','In the mood for',['All','Relaxed','Competitive','Immersive','Social','Quick play']],['mode','Play style',['All','Solo','Co-op','Multiplayer']]];
  return `${pageHead('Explore','Find the games that feel like you.',button('preferences',icon('settings',16)+' Tune your recommendations','button small'))}
    <div class="explore-layout"><div class="explore-main">
    ${!filtered&&sort==='recommended'&&feature?`<section class="personalized-hero"><img src="${feature.art}" alt=""><div><span class="eyebrow">${weights.has(feature.genre)?'BECAUSE YOU ENJOY '+feature.genre.toUpperCase():'YOUR NEXT DISCOVERY'}</span><h2>${esc(feature.title)}</h2><p>${interest?'More of what you love, with somewhere new to explore.':'Start with a little curiosity. Find your next favorite.'}</p><div class="game-tag-row">${gameDetails[feature.id].tags.map(tag=>`<span>${tag}</span>`).join('')}</div><div class="discovery-hero-actions">${link('game/'+feature.id,'View game '+icon('arrow',17),'button primary')}${button('hide-game','Not interested','text-button',`data-id="${feature.id}"`)}</div></div></section>
    <div class="discovery-preferences-note"><span>${icon('heart',18)} ${interest?'Recommendations use your genre preferences and favorite games.':'Make this space yours. Pick a few genres to get started.'}</span>${button('preferences',interest?'Edit interests':'Choose interests','text-button')}</div>
    ${related.length>1?shelf(interest?'Because you enjoy '+interest:'Get lost in a new world',interest?'Picked using your interests':'Games for your curious side',related.slice(0,8),'interest-games','explore?category='+(interest||'Adventure')):''}
    ${shelf('Better with friends','A few worlds worth sharing',ranked.filter(game=>gameDetails[game.id].mode==='Co-op').slice(0,8),'coop-games','explore?mode=Co-op')}
    ${shelf('A change of pace','Something a little different',ranked.filter(game=>game.genre!==interest&&gameDetails[game.id].mood==='Relaxed').slice(0,8),'relaxed-games','explore?mood=Relaxed')}`:''}
    <section class="discovery-results"><div class="section-top"><div><h2>${query?'Results for “'+esc(query)+'”':filtered?'Games for your mood':'More games for you'}</h2><p class="section-sub">${filtered?'Combine filters to find something specific.':interest?'A mix shaped by what you like.':'Choose interests for a more personal selection.'}</p></div><label class="sort-label">Sort by<select id="sort">${[['recommended','For you'],['rating','Top rated'],['players','Most popular'],['name','Name']].map(([value,label])=>`<option value="${value}" ${sort===value?'selected':''}>${label}</option>`).join('')}</select></label></div>
    <div class="results-summary"><span class="result-count" role="status">${results.length} game${results.length===1?'':'s'}</span>${filtered?button('clear-search','Clear filters','text-button'):''}</div><div class="game-grid discovery-game-grid">${results.map(card).join('')}</div>${!results.length?empty('Nothing fits those filters yet.','Try another genre, mood, or play style.',button('clear-search','Clear filters','button primary')):''}</section>
    ${!filtered?shelf('Popular with players','The community’s current favorites',filterGames(games,'','All','players').slice(0,8),'explore-popular','explore?sort=players'):''}
    </div><aside class="explore-filters"><div class="filter-heading"><h2>${icon('filter',18)} Find your game</h2>${button('toggle-filters','Show filters','filter-toggle','aria-expanded="false"')}${filtered?button('clear-search','Reset','text-button'):''}</div><form id="discovery-filter-form"><label for="discovery-query">Search games</label><input id="discovery-query" name="q" type="search" placeholder="Title or tag" value="${esc(query)}">${filterFields.map(([name,label,values])=>`<label for="filter-${name}">${label}</label><select id="filter-${name}" name="${name}">${values.map(value=>`<option value="${value}" ${(params.get(name)||'All')===value?'selected':''}>${value==='All'?'Any '+(name==='category'?'genre':name==='mood'?'mood':'style'):value}</option>`).join('')}</select>`).join('')}
    <label for="filter-rating">Player rating</label><select id="filter-rating" name="rating"><option value="">Any rating</option><option value="90" ${params.get('rating')==='90'?'selected':''}>90% and above</option><option value="95" ${params.get('rating')==='95'?'selected':''}>95% and above</option></select><label class="checkbox-label"><input type="checkbox" name="unplayed" ${params.get('unplayed')==='1'?'checked':''}> Hide my favorites</label><button type="submit" class="button primary full">Apply filters</button></form>
    <div class="filter-personal-note"><h3>Your taste, your picks.</h3><p>${state.preferredGenres.length?state.preferredGenres.join(' · '):'No genre preferences yet.'}</p>${button('preferences','Manage interests','text-button')}</div></aside></div>`;
}
function gamePage() {
  const game=games.find(game=>game.id===route.split('/')[1]);if(!game)return notFound();
  const info=gameDetails[game.id], servers=sampleServers(game.id), owned=reservedServerCards(state,game.id), owner=ownerForGame(game.id);
  const serverTab=params.get('tab')==='servers';
  const descriptions={Adventure:'Explore the unknown, discover hidden corners, and find your own path through a world full of possibility.',Action:'Bring your best moves, take on a new challenge, and team up with friends for your next adventure.',Obby:'Jump, dodge, and find your rhythm. Every obstacle is another chance to beat your personal best.',Simulation:'Start with a little imagination and make a world your own. Build, discover, and see where your curiosity takes you.',Roleplay:'Meet up with friends, find your favorite corner of the city, and create a story that belongs to you.',Racing:'Find your line and chase the perfect lap. A new personal best is waiting around the next corner.'};
  return `${link('explore','← Explore games','text-link')}<section class="game-detail game-overview"><div class="game-keyart"><img class="detail-art" src="${game.art}" alt="${esc(game.title)} artwork"><span>GAME PREVIEW</span></div><div><span class="eyebrow">${game.genre} · ${info.mode}</span><h1>${esc(game.title)}</h1><p class="game-creator">By ${creatorLink(game.id)}<span class="verified" aria-label="Sample creator">${icon('check',12)}</span></p><p>${descriptions[game.genre]}</p><div class="game-tag-row">${info.tags.map(tag=>`<span>${tag}</span>`).join('')}</div><div class="detail-stats"><div><strong>${game.rating}%</strong><span>Liked</span></div><div><strong>${game.playing}</strong><span>Active players</span></div><div><strong>${servers.length}</strong><span>Sample servers</span></div></div><div class="game-actions">${button('play',icon('play',22)+' Play','button play-button',`data-id="${game.id}"`)}${button('favorite',icon('heart',18)+(state.favorites.includes(game.id)?' Favorited':' Favorite'),`button ${state.favorites.includes(game.id)?'is-saved':''}`,`data-id="${game.id}" aria-pressed="${state.favorites.includes(game.id)}"`)}${button('share',icon('share',18),'button','aria-label="Share game"')}</div><p class="fine-print">Game and server activity are sample content. Live gameplay is not connected.</p></div></section>
    ${gameFriends(game.id)}<nav class="game-page-tabs" aria-label="Game sections">${link('game/'+game.id,'Overview',!serverTab?'selected':'')}${link('game/'+game.id+'?tab=servers','Servers ('+servers.length+')',serverTab?'selected':'')}</nav>
    ${!serverTab?`<section class="game-about"><h2>About this game</h2><p>${descriptions[game.genre]}</p><div class="game-facts"><div><span>Creator</span><strong>${creatorLink(game.id)}</strong></div><div><span>Play style</span><strong>${info.mode}</strong></div><div><span>Mood</span><strong>${info.mood}</strong></div><div><span>Play on</span><strong>Metallic Launcher</strong></div></div></section>`:''}
    <section class="reserved-servers-section"><div class="section-top"><div><h2>Your servers <span class="muted">(${owned.length})</span></h2><p class="section-sub">Your own space, with public or invite-only access.</p></div>${button('create-server',icon('create',16)+' Create private server','button',`data-id="${game.id}"`)}</div><div class="private-server-price"><span>${icon('alloy',18)} <strong>${SERVER_PRICE} Alloy</strong><small>One-time preview creation cost</small></span><span>Preview balance: <strong>${state.previewAlloy.toLocaleString()} Alloy</strong></span></div>${owned.length?`<div class="server-list">${owned.map(serverCard).join('')}</div>`:'<div class="reserved-empty">'+icon('friends',23)+'<p>Make room for your friends. Create a server and decide who can join.</p></div>'}</section>
    <section class="panel sandbox-note"><h2>How servers start</h2><p>Every server is created on request in its own sandbox. A hard resource ceiling keeps one world from affecting another, and the ceiling moves with the number of connected players: an empty lobby runs on the smallest tier, a full one scales up. Idle sandboxes shut down and their state is kept for the next join.</p><ul class="policy-list"><li><strong>Request</strong><span>A server is provisioned when the first player joins, in the closest region.</span></li><li><strong>Ceiling</strong><span>CPU, memory, and bandwidth are capped per server; a full server cannot exceed its tier.</span></li><li><strong>Scale</strong><span>Tiers step up with player count and step back down as players leave.</span></li></ul><p class="fine-print">Preview copy: server provisioning is not connected.</p></section>
    <section class="public-servers-section"><div class="section-top"><div><h2>Active servers</h2><p class="section-sub">Hover or focus a player to see their name.</p></div><label class="sort-label">Sort by<select id="server-sort"><option value="available" ${params.get('serverSort')==='available'||!params.get('serverSort')?'selected':''}>Available spaces</option><option value="players" ${params.get('serverSort')==='players'?'selected':''}>Most players</option></select></label></div><div class="server-list">${[...servers].sort((a,b)=>params.get('serverSort')==='players'?b.players.length-a.players.length:(b.capacity-b.players.length)-(a.capacity-a.players.length)).map(serverCard).join('')}</div><p class="fine-print">These are sample sessions. Join controls preview a launcher handoff; they do not start or connect to a live game.</p></section>
    ${shelf('You might also like','Keep exploring',games.filter(item=>item.id!==game.id).sort((a,b)=>Number(b.genre===game.genre)-Number(a.genre===game.genre)).slice(0,8),'related',`explore?category=${game.genre}`)}`;
}
function auth() {
  const signup=route==='signup';
  return `<div class="auth-layout"><div class="auth-story"><span class="eyebrow">WELCOME TO METALLIC</span><h2>Your next adventure<br>starts here.</h2><img src="art/game-5.svg" alt="Void Crafters world"><p>A little imagination. A whole new world.</p></div>
    <section class="auth-card"><span class="brand-glyph">M</span><h1>${signup?'Sign up for Metallic':'Log in to Metallic'}</h1><p>${signup?'A new world of possibilities starts with you.':'Pick up where you left off.'}</p>
    <form id="auth-form">${signup?`<div class="field"><label for="auth-username">Username</label><input id="auth-username" name="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" autocomplete="username" placeholder="Choose your username" aria-describedby="username-help"><small id="username-help">3–20 letters, numbers, or underscores.</small></div>`:''}
    <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
    <div class="field"><label for="password">Password</label><div class="password-field"><input name="password" id="password" type="password" required minlength="8" autocomplete="${signup?'new-password':'current-password'}" placeholder="At least 8 characters" aria-describedby="password-help">${button('password','Show','password-toggle','aria-label="Show password" aria-pressed="false"')}</div><small id="password-help">Use a sample password for this preview.</small></div>
    ${!signup?button('recovery','Forgot your password?','text-button recovery-link'):''}
    <div class="form-notice">Preview only. No account is created. Your email and password are never saved or sent.</div><button class="button primary full" type="submit">${signup?'Preview sign up':'Preview log in'} ${icon('arrow',17)}</button></form>
    <div class="auth-divider"><span>or</span></div>${link('home','Explore as a guest','button full')}<p class="auth-switch">${signup?'Already exploring? '+link('login','Log in','text-link'):'New to Metallic? '+link('signup','Sign up','text-link')}</p></section></div>`;
}
function download() { return `${pageHead('The adventure starts here.','Your home for every Metallic game.')}<section class="download-hero"><div><span class="eyebrow">METALLIC LAUNCHER</span><h2>Less waiting.<br>More playing.</h2><p>One home for your games, your friends, and whatever you discover next.</p><div class="categories">${['Windows','macOS','Linux'].map(p=>button('platform',p,`cat ${platform===p?'selected':''}`,`data-value="${p}" aria-pressed="${platform===p}"`)).join('')}</div><button class="button primary download-button" disabled>${icon('download')} ${platform} release coming soon</button><p class="fine-print">The launcher is in development. An installer will appear here when an official release is available.</p></div><div class="launcher-mock"><div class="window-dots"><i></i><i></i><i></i><span>Metallic Launcher · Preview</span></div><img src="art/game-1.svg" alt="Launcher game preview"><div><strong>Your next adventure</strong><span>Cyber Raven: Neon Protocol</span><span class="launch-preview">${icon('play',15)} Jump in</span></div></div></section><div class="feature-columns download-features"><article><span class="step">01</span><h3>Get the launcher</h3><p>Download the official installer for your device when it becomes available.</p></article><article><span class="step">02</span><h3>Make yourself at home</h3><p>Sign in with your Metallic account and bring your identity with you.</p></article><article><span class="step">03</span><h3>Find your next favorite</h3><p>Explore games and jump into something new.</p></article></div><div class="panel"><h3>${platform} availability</h3><p class="muted">Release date, supported ${platform} versions, and system requirements will be confirmed with the first official launcher build.</p></div>`; }
function mannequin(outfit=draftOutfit,color=draftColor,accessory=draftAccessory,back=avatarBack) {
  return `<div class="mannequin ${outfit.toLowerCase()} ${back?'back-view':''} accessory-${accessory.toLowerCase()}" style="--shirt:${esc(color)}" role="img" aria-label="${esc(outfit)} avatar with ${accessory==='None'?'no accessory':accessory.toLowerCase()}, ${back?'back':'front'} view"><div class="figure-head"><i></i><i></i><span></span><div class="figure-accessory"></div></div><div class="figure-body"><b>M</b></div><div class="figure-arm left"></div><div class="figure-arm right"></div><div class="figure-leg left"></div><div class="figure-leg right"></div></div>`;
}
function wardrobe() {
  const dirty=draftOutfit!==state.outfit||draftColor!==state.color||draftAccessory!==state.accessory;
  return `${pageHead('Wardrobe','Make every adventure a little more you.',button('save-outfit',icon('check',17)+' Save look','button primary',dirty?'':'disabled'))}
    <div class="wardrobe-layout"><section class="avatar-preview"><div class="avatar-preview-top"><span class="eyebrow">YOUR AVATAR</span><span class="tag">${dirty?'Unsaved changes':'Equipped'}</span></div><div class="avatar-stage">${mannequin()}</div>
    <div class="avatar-controls">${button('rotate-avatar',icon('rotate',16)+' '+(avatarBack?'Front view':'Back view'),'button small',`aria-pressed="${avatarBack}"`)}</div><h2>${esc(state.profile.name)}</h2><p>${esc(draftOutfit)} · ${colors.find(c=>c.value===draftColor)?.name||'Custom color'}</p><div class="equipped-items"><span>${icon('wardrobe',16)} ${draftOutfit}</span>${draftAccessory!=='None'?`<span>${draftAccessory}</span>`:''}</div></section>
    <section class="wardrobe-inventory"><div class="line-tabs" role="group" aria-label="Wardrobe categories">${['Outfits','Accessories','Colors'].map(t=>button('wardrobe-tab',t,wardrobeTab===t?'selected':'',`data-value="${t}" aria-pressed="${wardrobeTab===t}"`)).join('')}</div>
    <div class="inventory-heading"><div><h2>${wardrobeTab==='Colors'?'Choose a color':wardrobeTab==='Accessories'?'The finishing touch':'Your outfits'}</h2><p class="muted">${wardrobeTab==='Colors'?'A fresh color for your favorite look.':'Select an item to try it on.'}</p></div><span class="tag">${wardrobeTab==='Colors'?colors.length:3} items</span></div>
    ${wardrobeTab==='Colors'?`<div class="color-grid">${colors.map(c=>`<button type="button" class="color-choice ${draftColor===c.value?'selected':''}" data-action="color" data-value="${c.value}" aria-label="${c.name}" aria-pressed="${draftColor===c.value}"><span style="--swatch:${c.value}">${draftColor===c.value?icon('check',24):''}</span><strong>${c.name}</strong></button>`).join('')}</div>`:
    `<div class="outfit-grid">${(wardrobeTab==='Accessories'?accessories:outfits).map((name,i)=>`<button type="button" class="outfit-card ${(wardrobeTab==='Accessories'?draftAccessory:draftOutfit)===name?'selected':''}" data-action="${wardrobeTab==='Accessories'?'accessory':'outfit'}" data-value="${name}" aria-pressed="${(wardrobeTab==='Accessories'?draftAccessory:draftOutfit)===name}"><span class="outfit-art style-${i}">${portrait({outfit:wardrobeTab==='Outfits'?name:draftOutfit,color:draftColor,accessory:wardrobeTab==='Accessories'?name:draftAccessory},'', '')}<i>${icon('check',14)}</i></span><strong>${name}</strong><small>Owned</small></button>`).join('')}</div>`}
    <div class="wardrobe-save-note"><p>${dirty?'You have unsaved changes. Save your look to update your profile.':'Your saved look appears on your profile and across Metallic.'}</p>${button('reset-outfit','Reset changes','text-button',dirty?'':'disabled')}</div></section></div>`;
}
function create() {
  const tab=Object.hasOwn(creatorTypes,params.get('tab'))?params.get('tab'):'games';
  const slot=cosmeticSlots.includes(params.get('slot'))?params.get('slot'):'';
  const listings=params.get('view')==='listings';
  const items=tab==='games'?state.projects:state.creatorAssets.filter(asset=>asset.type===tab&&(!slot||asset.subcategory===slot)&&(!listings||asset.listing));
  const singular={games:'game',models:'model',audio:'audio',plugins:'plugin',cosmetics:'cosmetic'}[tab];
  return `${pageHead('Creator hub','Build the next thing players fall in love with.',button(tab==='games'?'new-project':'new-asset',icon('create',17)+' New '+singular,'button primary',`data-value="${tab}"`))}
    <div class="creator-topline"><nav class="creator-category-tabs" aria-label="Creator categories">${Object.entries(creatorTypes).map(([key,label])=>link('create?tab='+key,icon(key==='games'?'play':key==='cosmetics'?'wardrobe':key,18)+label,key===tab?'selected':'')).join('')}</nav>${link('marketplace','Creator Marketplace '+icon('arrow',16),'button small')}</div>
    ${tab==='cosmetics'?`<nav class="cosmetic-slots" aria-label="Cosmetic categories">${link('create?tab=cosmetics','All cosmetics',!slot?'selected':'')}${cosmeticSlots.map(name=>link('create?tab=cosmetics&slot='+name,name,slot===name?'selected':'')).join('')}</nav>`:''}
    <section class="creator-workspace-head"><div><span class="eyebrow">YOUR LIBRARY</span><h2>${slot||creatorTypes[tab]}</h2><p>${tab==='games'?'Plan, organize, and build your games.':tab==='models'?'Reusable models, meshes, and materials for your worlds.':tab==='audio'?'Music, ambience, and sounds that bring a game to life.':tab==='plugins'?'Tools that make creating a little easier.':'Wearable ideas, organized by where they belong.'}</p></div><div class="creator-total"><strong>${items.length}</strong><span>${listings?'listing drafts':'local drafts'}</span></div></section>
    ${tab!=='games'?`<nav class="creator-library-tabs" aria-label="Library view">${link('create?tab='+tab+(slot?'&slot='+slot:''),'My assets',!listings?'selected':'')}${link('create?tab='+tab+'&view=listings'+(slot?'&slot='+slot:''),'Listing drafts',listings?'selected':'')}</nav>`:''}
    ${items.length?`<div class="creator-draft-grid">${items.map(item=>`<article class="creator-draft-card"><div class="draft-cover color-${tab==='audio'?'purple':tab==='cosmetics'?'amber':'blue'}">${assetIcon(tab)}<span class="tag">${item.listing?'Listing draft':'Draft'}</span></div><div class="draft-card-body"><h3>${esc(item.name)}</h3><p>${esc(tab==='games'?item.template+(item.groupId?' · '+(findGroup(state,item.groupId)?.name||'Group'):''):item.subcategory||creatorTypes[tab])}</p><div class="button-row">${button(tab==='games'?'edit-project':'edit-asset','Edit','button small',`data-id="${esc(item.id)}"`)}${tab==='games'?button('delete-project','Delete','button quiet small',`data-id="${esc(item.id)}"`):button('prepare-listing',item.listing?'Edit listing':'Prepare listing','button small',`data-id="${esc(item.id)}"`)}</div></div></article>`).join('')}</div>`:
    empty(listings?'Your first listing starts here.':`Your next ${singular} starts here.`,listings?'Create an asset, then prepare its marketplace listing.':tab==='games'?'Give your idea a name and choose a starting template.':'Organize an idea, add its details, and prepare it for your creator library.',button(tab==='games'?'new-project':'new-asset','Create '+singular,'button primary',`data-value="${tab}"`))}
    <section class="creator-market-banner"><span class="market-banner-icon">${icon('marketplace',34)}</span><div><span class="eyebrow">MADE FOR CREATORS</span><h2>Build with the community.</h2><p>Find models, audio, plugins, and cosmetics—or prepare your own assets for sale.</p></div>${link('marketplace','Browse Marketplace '+icon('arrow',17),'button')}</section>
    <p class="fine-print">Local planning drafts. Asset uploads, Studio editing, marketplace publication, and sales will connect when creator services launch.</p>`;
}
const packs = [{amount:400,price:'$4.99'},{amount:800,price:'$9.99'},{amount:1700,price:'$19.99'},{amount:4500,price:'$49.99'}];
function alloy() { return `${pageHead('Buy Alloy','More ways to make Metallic your own.')}<section class="alloy-intro"><div class="alloy-coin">${icon('alloy',72)}</div><div><span class="eyebrow">MAKE MORE OF METALLIC</span><h2>Put your own spin on play.</h2><p>Personalize your avatar and discover more ways to express yourself.</p></div><div class="balance"><span>Preview balance</span><strong>${icon('alloy',24)} ${state.previewAlloy.toLocaleString()}</strong></div></section><div class="notice"><span>${icon('alloy')}<span><strong>Store preview</strong><small>Illustrative packs and prices. Purchases are not available and no payment is collected.</small></span></span></div>${earnPanel()}<div class="alloy-packs">${packs.map((p,i)=>`<article class="alloy-pack ${i===2?'featured':''}">${i===2?'<span class="pack-ribbon">A little extra possibility</span>':''}${icon('alloy',44)}<h2>${p.amount.toLocaleString()}</h2><p>Alloy</p><strong class="pack-price">${p.price} <small>USD</small></strong>${button('review-pack','Preview pack','button '+(i===2?'primary':''),`data-index="${i}"`)}</article>`).join('')}</div><section class="faq"><h2>Good to know</h2><details><summary>What is Alloy?</summary><p>Alloy is the planned virtual currency for Metallic, designed for avatar items and in-game content.</p></details><details><summary>Can I buy Alloy now?</summary><p>Not yet. This is a store preview. Payment processing, final pricing, and purchase terms will be added before the store launches.</p></details><details><summary>Will my preview balance be saved?</summary><p>The displayed ${state.previewAlloy.toLocaleString()} Alloy is sample content. It is not a real wallet or a transferable balance.</p></details></section>`; }
function profile() {
  const requested=params.get('user'), own=!requested||requested===state.profile.name;
  const person=own?null:community.find(p=>p.name===requested)||(state.friends.includes(requested)?personInfo(requested):null);
  if(!own&&!person)return notFound();
  const name=own?state.profile.name:requested, friends=own?state.friends:[...new Set([...(connections[name]||[]),...(state.friends.includes(name)?[state.profile.name]:[])])], mutual=own?[]:mutualFriends(state,name);
  const favorites=games.filter(game=>(own?state.favorites:(sampleFavorites[name]||[])).includes(game.id));
  const publishedCreations=games.filter(game=>{const owner=ownerForGame(game.id);return owner.type==='user'&&owner.id===name;});
  const friendAction=state.friends.includes(name)?button('remove-friend','Friends '+icon('check',16),'button',`data-name="${esc(name)}"`):state.requests.includes(name)?button('accept-friend','Accept request','button primary',`data-name="${esc(name)}"`):state.outgoing.includes(name)?button('cancel-friend','Cancel request','button',`data-name="${esc(name)}"`):button('add-friend','Add friend','button primary',`data-name="${esc(name)}"`);
  return `<section class="profile-cover"><div class="cover-mark">M</div><span class="eyebrow">${own?'YOUR CORNER OF METALLIC':'PLAYER PROFILE'}</span></section>
    <section class="profile-header">${own?avatar(0,'profile-avatar'):referenceAvatar(person.avatar,'profile-avatar')}<div><h1>${esc(name)}</h1><p>@${esc(name)} ${own?(state.activity?'<span class="profile-online">● Online in preview</span>':''):`<span class="profile-online">${person.activity}</span>`}</p>
    ${!own?`<a class="mutual-summary" href="#/profile?user=${encodeURIComponent(name)}&friends=mutual"><span>${mutual.length} mutual friend${mutual.length===1?'':'s'}</span></a>`:''}</div><div class="profile-header-action">${own?link('settings?section=account','Edit profile','button'):friendAction}${!own&&state.friends.includes(name)?button('gift','Send gift','button small'):''}${!own?button('block',state.blocked.includes(name)?'Unblock':'Block','button small'):''}${!own?button('report','Report','text-button'):''}</div></section>
    <div class="account-profile-layout"><div class="profile-main-column">
    ${profileFriends(friends,own,mutual,params.get('friends')==='mutual')}
    <section class="profile-section"><div class="section-top"><h2>Favorite games <span class="muted">(${favorites.length})</span></h2>${own?link('explore','Find more →','view-all'):''}</div>${favorites.length?`<div class="game-grid profile-games">${favorites.map(card).join('')}</div>`:'<div class="inline-empty">No favorite games yet.'+(own?' '+link('explore','Find your next favorite →','text-link'):'')+'</div>'}</section>
    <section class="profile-section"><div class="section-top"><h2>Creations <span class="muted">(${publishedCreations.length+(own?state.projects.length:0)})</span></h2>${own?link('create','Creator hub →','view-all'):''}</div>${publishedCreations.length?`<div class="game-grid profile-games">${publishedCreations.map(card).join('')}</div>`:''}${own&&state.projects.length?state.projects.map(project=>`<div class="creation-row"><span>${icon('create')} ${esc(project.name)}</span>${button('edit-project','Edit draft','button small',`data-id="${esc(project.id)}"`)}</div>`).join(''):publishedCreations.length?'':'<div class="inline-empty">'+(own?'Your next idea belongs here. '+link('create','Create a game →','text-link'):'No published games yet.')+'</div>'}</section>
    ${own?historySection():''}
    ${profileGroups(name,own)}
    <section class="profile-section"><div class="section-top"><h2>Badges</h2><span class="muted small-text">Preview collection</span></div><div class="badge-grid">${badges.slice(0,own?3:2).map((badge,i)=>`<article class="profile-badge"><span class="badge-emblem badge-${i}">${icon(badge.icon,28)}</span><div><h3>${badge.name}</h3><p>${badge.description}</p></div></article>`).join('')}</div></section>
    </div><aside class="profile-meta-column"><section class="panel profile-about"><h3>About</h3><p>${esc(own?state.profile.bio:person.bio)||'No bio yet.'}</p><span class="tag">${own?'Your profile':'Sample player'}</span>${own?link('wardrobe','Customize avatar →','button full'):''}${profileSocial(own)}</section>${own?`<section class="profile-avatar-stage">${mannequin(state.outfit,state.color,state.accessory,false)}<span>Currently wearing · ${state.outfit}</span></section>`:''}</aside></div>`;
}
function profileGroups(name,own) {
  const groups=groupsForProfile(state,name);
  return `<section class="profile-section profile-groups"><div class="section-top"><h2>Groups <span class="muted">(${groups.length})</span></h2>${own?link('groups','Discover groups →','view-all'):''}</div>${groups.length?`<div class="profile-group-grid">${groups.map(group=>`<a class="profile-group-card" href="#/groups/${group.id}"><span class="profile-group-emblem">${groupEmblem(group)}${group.owned?`<span class="group-owner-icon" aria-label="Group owner" title="Group owner">${icon('crown',15)}</span>`:''}</span><span class="profile-group-info"><strong>${esc(group.name)}</strong><small class="profile-group-role">${esc(group.role)}</small></span>${icon('arrow',15)}</a>`).join('')}</div>`:'<div class="inline-empty">'+(own?'You haven’t joined a group yet. '+link('groups','Find your community →','text-link'):'No groups to show yet.')+'</div>'}</section>`;
}
function settings() {
  const section=Object.hasOwn(settingsSections,params.get('section'))?params.get('section'):'account';
  let content='';
  if(section==='account')content=settingsForm(section,`<label for="setting-name">Username</label><input id="setting-name" name="name" aria-label="Username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+" value="${esc(state.profile.name)}"><small class="field-hint">3–20 letters, numbers, or underscores.</small><label for="setting-bio">Bio</label><textarea id="setting-bio" name="bio" maxlength="240" rows="4">${esc(state.profile.bio)}</textarea><small class="field-hint">A little about you, in 240 characters or less.</small>${accountLinks()}<div class="account-readonly"><span>Sign-in email</span><strong>Available with live accounts</strong></div>`);
  if(section==='privacy')content=settingsForm(section,`<label for="setting-visibility">Who can view my profile?</label><select id="setting-visibility" name="visibility">${['Everyone','Friends only','Only me'].map(v=>`<option ${state.profile.visibility===v?'selected':''}>${v}</option>`).join('')}</select><label for="setting-friend-policy">Who can send me friend requests?</label><select id="setting-friend-policy" name="friendPolicy">${['Everyone','Friends of friends','Nobody'].map(v=>`<option ${state.friendPolicy===v?'selected':''}>${v}</option>`).join('')}</select><label for="setting-join-policy">Who can join me in games?</label><select id="setting-join-policy" name="joinPolicy">${['Everyone','Friends','Nobody'].map(value=>`<option ${state.joinPolicy===value?'selected':''}>${value}</option>`).join('')}</select><label class="toggle-row"><span><strong>Show my activity</strong><small>Let friends see what I’m playing.</small></span><input type="checkbox" name="activity" role="switch" ${state.activity?'checked':''}></label><p class="fine-print">Privacy preferences are saved locally. Cross-account privacy controls will apply when live accounts are connected.</p>`);
  if(section==='notifications')content=settingsForm(section,`<label class="toggle-row"><span><strong>Friend requests</strong><small>See incoming friend requests in your inbox.</small></span><input name="notifications" type="checkbox" role="switch" ${state.notifications?'checked':''}></label><label class="toggle-row"><span><strong>Platform updates</strong><small>See welcome messages and platform announcements.</small></span><input name="updates" type="checkbox" role="switch" ${state.updateNotifications?'checked':''}></label><div class="settings-info">${icon('bell',20)}<p>Notifications open from the bell in the top right. These preferences control your preview inbox.</p></div>`);
  if(section==='discovery')content=settingsForm(section,`<fieldset class="genre-preferences"><legend>What do you like to play?</legend><p>Pick a few genres. Your favorites also help shape your recommendations.</p><div>${genres.map(genre=>`<label><input name="genres" type="checkbox" value="${genre}" ${state.preferredGenres.includes(genre)?'checked':''}><span>${genre}</span></label>`).join('')}</div></fieldset><div class="settings-info">${icon('explore',20)}<p>${state.hiddenGames.length} hidden games. Hidden games stay out of your recommendations.</p></div>${state.hiddenGames.length?button('reset-hidden','Restore hidden games','button small'):''}`);
  if(section==='appearance')content=settingsForm('appearance',themeSettings());
  if(section==='community')content=settingsForm('community',`<label for="setting-discord">Discord username</label><input id="setting-discord" name="discord" maxlength="80" value="${esc(state.links.discord)}" placeholder="name or name#0000"><small class="field-hint">Linking carries your username, avatar, and roles between the site and the community server.</small><div class="settings-info">${icon('community',20)}<p>${state.links.discord?'Linked as '+esc(state.links.discord)+'. Channel roles follow this account.':'No Discord account linked yet. You can still browse the community page.'}</p></div>${link('community','Open the community page','text-link')}`);
  if(section==='security')content=`<section class="panel security-section"><h2>Security</h2><p class="settings-description">Your account access, in one place.</p><div class="security-row"><span>${icon('settings',22)}<span><strong>Password</strong><small>Live account authentication is not connected.</small></span></span><button class="button small" disabled>Change password</button></div><div class="security-row"><span>${icon('check',22)}<span><strong>Two-step verification</strong><small>Available when live accounts launch.</small></span></span><span class="tag">Coming later</span></div><div class="security-row"><span>${icon('profile',22)}<span><strong>Active sessions</strong><small>This preview does not create an authenticated session.</small></span></span></div></section>`;
  if(section==='data')content=`<section class="panel"><h2>Preview data</h2><p class="settings-description">Your preview stays in this browser.</p><div class="data-summary"><div><strong>${state.favorites.length}</strong><span>Favorite games</span></div><div><strong>${state.projects.length+state.creatorAssets.length}</strong><span>Creator drafts</span></div><div><strong>${state.friends.length}</strong><span>Friends</span></div></div><p class="muted small-text">Profile details, game preferences, saved looks, and drafts are stored locally. Emails and passwords are never stored.</p><div class="reset-panel"><div><h3>Reset preview</h3><p class="muted">Restore the sample data and remove your local changes.</p></div>${button('reset-demo','Reset preview','button danger')}</div></section>`;
  return `${pageHead('Settings','Your account. Your preferences.')}<div class="settings-layout"><nav class="settings-nav" aria-label="Settings sections">${Object.entries(settingsSections).map(([id,[label]])=>`<a href="#/settings?section=${id}" class="${section===id?'active':''}" ${section===id?'aria-current="page"':''}>${icon(id==='account'?'profile':id==='notifications'?'bell':id==='discovery'?'explore':'settings',18)}${label}</a>`).join('')}</nav><div class="settings-section-content">${content}</div></div>`;
}
function friends() {
  const query=params.get('person')||'';
  const list=friendTab==='Requests'?state.requests:friendTab==='Sent'?state.outgoing:friendTab==='Find people'?community.map(p=>p.name).filter(n=>n!==state.profile.name&&!state.friends.includes(n)&&!state.requests.includes(n)):state.friends;
  const shown=list.filter(name=>name.toLowerCase().includes(query.trim().toLowerCase()));
  const online=state.friends.filter(name=>presenceFor(state,name).key!=='offline').length;
  return `${pageHead('Friends',`${state.friends.length} friends · ${online} online`,link('friends?tab=find',icon('create',17)+' Add friends','button primary'))}
    <div class="friends-toolbar"><div class="line-tabs" role="group" aria-label="Friends categories">${Object.entries(friendTabs).map(([key,label])=>button('friend-tab',label+(['Requests','Sent'].includes(label)?` <span>${label==='Requests'?state.requests.length:state.outgoing.length}</span>`:''),friendTab===label?'selected':'',`data-value="${key}" aria-pressed="${friendTab===label}"`)).join('')}</div>
    <form id="friend-search" class="top-search">${icon('search',17)}<input type="search" name="person" aria-label="Search people" placeholder="Search people" value="${esc(query)}"><button class="search-submit" type="submit" aria-label="Find people by name">${icon('arrow',16)}</button></form></div>
    <p class="result-count" role="status">${shown.length} ${friendTab==='Requests'?'pending request'+(shown.length===1?'':'s'):friendTab==='Sent'?'sent request'+(shown.length===1?'':'s'):friendTab==='Find people'?'people to discover':'friend'+(shown.length===1?'':'s')}${query?' matching “'+esc(query)+'”':''}</p>
    <div class="friend-grid">${shown.map(name=>{const p=personInfo(name);const sent=state.outgoing.includes(name);return `<article class="panel friend-card"><a class="friend-card-identity" href="#/profile?user=${encodeURIComponent(name)}"><span class="friend-picture">${referenceAvatar(p.avatar)}${presenceDot(name)}</span><h3>${esc(name)}</h3></a><p class="muted">${friendTab==='Requests'?'Wants to connect':friendTab==='Sent'||sent?'Request pending':p.activity}</p><div class="button-row">
      ${friendTab==='Requests'?button('accept-friend','Accept','button primary small',`data-name="${esc(name)}"`)+button('decline-friend','Ignore','button small',`data-name="${esc(name)}"`):friendTab==='Sent'||sent?button('cancel-friend','Cancel request','button small',`data-name="${esc(name)}"`):friendTab==='Find people'?button('add-friend',icon('create',14)+' Add friend','button primary small',`data-name="${esc(name)}"`):link('profile?user='+encodeURIComponent(name),'View profile','button small')+button('remove-friend','Remove','button quiet small',`data-name="${esc(name)}"`)}</div></article>`;}).join('')}</div>
    ${!shown.length?empty(query?'No people found':friendTab==='Requests'?'All caught up':friendTab==='Sent'?'No pending requests':'Find your people',query?'Try a different name.':friendTab==='Requests'?'New friend requests will appear here.':'Discover someone new to explore with.',query?button('clear-people','Clear search','button primary'):link('friends?tab=find','Find people')):''}
    <p class="fine-print">Preview community. Friend requests stay in this browser and are not sent to real people.</p>`;
}
function itemName(id){return marketplaceAssets.find(asset=>asset.id===id)?.name||'Accessory';}
function earnPanel(){
  const progress=questProgress(state),claimed=state.claimedQuests[weekKey()]||[];
  return `<section class="earn-panel"><div class="section-top"><div><h2>Earn free currency</h2><p class="section-sub">Weekly quests, no purchase needed. They reset every Monday.</p></div><span class="tag">${claimed.length}/${QUESTS.length} claimed</span></div><div class="quest-grid">${QUESTS.map(quest=>{const value=progress[quest.id]||0,done=value>=quest.target,isClaimed=claimed.includes(quest.id);return `<article class="quest-card ${done?'ready':''}"><div class="quest-top"><strong>${quest.title}</strong><span class="quest-reward">${icon('alloy',13)} ${quest.reward}</span></div><p>${quest.detail}</p><div class="quest-foot"><span>${Math.min(value,quest.target)} / ${quest.target}</span>${isClaimed?'<span class="tag">Claimed</span>':button('claim-quest',done?'Claim':'Not yet','button small',done?`data-value="${quest.id}"`:'disabled aria-disabled="true"')}</div></article>`;}).join('')}</div></section>`;
}
function tradeRow(offer){
  const person=personInfo(offer.counterpart);
  return `<li class="trade-row"><div class="trade-person">${referenceAvatar(person.avatar)}<span><strong>${esc(offer.counterpart)}</strong><small>${offer.direction==='in'?'Offered to you':'Waiting for an answer'}</small></span></div><div class="trade-give">${offer.alloy?`<span>${icon('alloy',14)} ${offer.alloy} Alloy</span>`:''}${offer.item?`<span>${esc(itemName(offer.item))}</span>`:''}</div><div class="trade-actions">${offer.direction==='in'?button('trade-accept','Accept','button small primary',`data-id="${esc(offer.id)}"`):''}${button('trade-cancel',offer.direction==='in'?'Decline':'Cancel','button small quiet',`data-id="${esc(offer.id)}"`)}</div></li>`;
}
function tradesPage(){
  const pending=pendingTrades(state).filter(offer=>offer.status==='pending');
  const incoming=pending.filter(offer=>offer.direction==='in'),outgoing=pending.filter(offer=>offer.direction==='out');
  const ownable=state.savedAssets.filter(id=>marketplaceAssets.some(asset=>asset.id===id));
  return `${pageHead('Trading','Swap Alloy and accessories with friends.')}
    <div class="notice"><span>${icon('trade',20)}<span><strong>Trade preview</strong><small>Offers are saved in this browser. Nothing is sent to another person and no item leaves this demo.</small></span></div>
    <div class="trade-layout">
      <section class="panel trade-column"><div class="section-top"><h2>Offers for you <span class="muted">(${incoming.length})</span></h2></div>${incoming.length?`<ul class="trade-list">${incoming.map(tradeRow).join('')}</ul>`:'<div class="inline-empty">No offers waiting right now.</div>'}</section>
      <section class="panel trade-column"><div class="section-top"><h2>Your offers <span class="muted">(${outgoing.length})</span></h2></div>${outgoing.length?`<ul class="trade-list">${outgoing.map(tradeRow).join('')}</ul>`:'<div class="inline-empty">You have not offered a trade yet.</div>'}
        <div class="trade-start"><h3>Start a trade</h3><p class="muted">Pick a friend, then choose Alloy, an accessory you own, or both.</p><div class="trade-friends">${state.friends.filter(friend=>!state.blocked.includes(friend)).map(friend=>button('trade',friend,'button small')).join('')||'<span class="muted small-text">Add a friend first.</span>'}</div><p class="fine-print">You own ${ownable.length} giftable ${ownable.length===1?'accessory':'accessories'} from the creator marketplace.</p></div></section>
    </div>`;
}
function communityPage(){
  const channels=[['announcements','Release notes and platform news','Read only'],['general','Everyday conversation','Open'],['creators','Builders sharing work in progress','Open'],['help','Questions, answers, and bug reports','Open'],['clips','Your best moments of the week','Open']];
  const roles=[['Team','The people building Metallic'],['Creator','Published a game or asset'],['Moderator','Keeps channels and games tidy'],['Member','Everyone else']];
  return `${pageHead('Community','The conversation carries on outside the site.')}
    <section class="discord-card"><div class="discord-copy"><span class="eyebrow">METALLIC DISCORD</span><h2>${state.links.discord?'Linked as '+esc(state.links.discord):'Link your Discord account'}</h2><p>One identity across the site and the server. Roles follow the account you sign in with, so creators and moderators land in the right rooms without asking.</p><div class="button-row">${state.links.discord?link('settings?section=community','Manage the link','button'):link('settings?section=community','Link Discord','button primary')}${button('copy-community','Copy invite code','button')}</div></div><div class="discord-channels"><span class="side-section-label">CHANNELS</span><ul class="channel-list">${channels.map(([name,topic,stateLabel])=>`<li class="channel-row"><span class="channel-hash">#</span><span><strong>${name}</strong><small>${topic}</small></span><small class="channel-state">${stateLabel}</small></li>`).join('')}</ul></div></section>
    <div class="community-grid"><section class="panel"><h2>Roles</h2><ul class="policy-list">${roles.map(([role,sets])=>`<li><strong>${role}</strong><span>${sets}</span></li>`).join('')}</ul></section><section class="panel"><h2>What carries across</h2><ul class="policy-list"><li><strong>Identity</strong><span>Your username and avatar, with one verification for both places.</span></li><li><strong>Enforcement</strong><span>A Discord ban records the same person as a site ban, so every linked account stays in step.</span></li><li><strong>Privacy</strong><span>The link is optional. Declining it does not change what you can play.</span></li></ul></section></div>
    <p class="fine-print">Channels, roles, and the invite are sample content. The Discord connection is not live.</p>`;
}
function tradeEditor(name){
  if(!state.friends.includes(name)){toast('Trades are between friends.');return;}
  const items=state.savedAssets.filter(id=>marketplaceAssets.some(asset=>asset.id===id));
  modal('Trade with '+esc(name),`<form id="trade-form" class="trade-form" data-name="${esc(name)}"><p class="muted">Choose what you are offering. The offer stays pending until your friend answers.</p><label for="trade-alloy">Alloy</label><input id="trade-alloy" name="alloy" type="number" min="0" max="1000000" step="1" value="25" inputmode="numeric">${items.length?`<label for="trade-item">Accessory</label><select id="trade-item" name="item"><option value="">No accessory</option>${items.map(id=>`<option value="${esc(id)}">${esc(itemName(id))}</option>`).join('')}</select>`:'<p class="fine-print">You own no marketplace accessories yet. Save one in the creator marketplace to trade it.</p>'}<p id="trade-error" class="form-error" role="alert"></p><div class="button-row">${button('close-dialog','Cancel','button')}<button class="button primary" type="submit">Send offer</button></div></form>`);
}
function reportEditor(name){
  const reasons=['Harassment or bullying','Scam or phishing','Inappropriate content','Impersonation'];
  modal('Report '+esc(name),`<form id="report-form" class="report-form"><p class="muted">Pick the closest reason. The report is queued with this profile name and the time.</p><fieldset class="report-reasons"><legend>Reason</legend>${reasons.map((reason,index)=>`<label class="radio-pill"><input type="radio" name="reason" value="${esc(reason)}" ${index===0?'checked':''}> <span>${reason}</span></label>`).join('')}</fieldset><p id="report-error" class="form-error" role="alert"></p><div class="button-row">${button('close-dialog','Cancel','button')}<button class="button primary" type="submit">Send report</button></div></form>`);
}
function copyText(value,message){
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(value).then(()=>toast(message),()=>toast('Copy failed. The invite is '+value+'.'));return;}
  toast('The invite is '+value+'.');
}
function markSettingsDirty(){settingsDirty=true;const label=document.querySelector('.settings-save .muted');if(label)label.textContent='Unsaved changes';}
function timeAgo(at,now=Date.now()){
  const minutes=Math.max(0,Math.floor((now-at)/60000));
  if(minutes<1)return 'Just now';
  if(minutes<60)return minutes+(minutes===1?' minute ago':' minutes ago');
  const hours=Math.floor(minutes/60);
  if(hours<24)return hours+(hours===1?' hour ago':' hours ago');
  const days=Math.floor(hours/24);
  return days+(days===1?' day ago':' days ago');
}
function dailyRewardStrip(){
  const ready=canClaimDaily(state);
  return `<section class="daily-strip"><span class="daily-icon">${icon('alloy',22)}</span><div class="daily-copy"><strong>${ready?DAILY_REWARD+' Alloy is waiting today':'Today’s Alloy is claimed'}</strong><small>${ready?'A small thank-you for playing. One claim each day.':'Come back tomorrow for another '+DAILY_REWARD+' Alloy.'}</small></div><div class="daily-actions"><span class="daily-balance">${icon('alloy',14)} ${state.previewAlloy.toLocaleString()}</span>${button('claim-daily',ready?'Claim reward':'Claimed','button small',ready?'':'disabled aria-disabled="true"')}${link('alloy','Earn more Alloy','text-link')}</div></section>`;
}
function playHistory(){
  return state.playHistory.map(entry=>({entry,game:games.find(game=>game.id===entry.id)})).filter(row=>row.game);
}
function historyShelf(){
  return `<section class="home-section"><div class="section-top"><div><h2>Continue playing</h2><p class="section-sub">Pick up where you left off</p></div>${link('profile','Play history '+icon('arrow',15),'view-all')}</div><div class="history-list">${playHistory().slice(0,4).map(({entry,game})=>`<a class="history-row" href="#/game/${game.id}"><img src="${game.art}" alt="" width="52" height="52"><span><strong>${esc(game.title)}</strong><small>${esc(game.genre)} · ${timeAgo(entry.at)}</small></span>${icon('arrow',15)}</a>`).join('')}</div></section>`;
}
function historySection(){
  const played=playHistory();
  return `<section class="profile-section"><div class="section-top"><h2>Play history <span class="muted">(${played.length})</span></h2>${played.length?button('clear-history','Clear history','text-button'):''}</div>${played.length?`<div class="history-list">${played.map(({entry,game})=>`<a class="history-row" href="#/game/${game.id}"><img src="${game.art}" alt="" width="52" height="52"><span><strong>${esc(game.title)}</strong><small>${esc(game.genre)} · ${timeAgo(entry.at)}</small></span>${icon('arrow',15)}</a>`).join('')}</div>`:`<div class="inline-empty">Games you open appear here. ${link('explore','Find something to play →','text-link')}</div>`}</section>`;
}
function profileSocial(own){
  if(!own)return '';
  const known=[['discord','Discord'],['youtube','YouTube'],['twitch','Twitch'],['tiktok','TikTok']].filter(([key])=>state.links[key]);
  return `<div class="profile-social"><h4>Links</h4>${known.length?`<div class="social-links">${known.map(([key,label])=>`<span class="social-link"><strong>${label}</strong><small>${esc(state.links[key])}</small></span>`).join('')}</div>`:`<p class="muted small-text">No links yet. ${link('settings?section=account','Add your links →','text-link')}</p>`}</div>`;
}
function themeSettings(){
  return `<fieldset class="theme-picker"><legend>Theme</legend><p class="field-hint">Saved on this device. Layout and contrast stay the same in every theme.</p><div class="theme-grid">${themes.map(theme=>`<label class="theme-choice ${state.theme===theme.id?'selected':''}"><input type="radio" name="theme" value="${theme.id}" ${state.theme===theme.id?'checked':''} data-action="theme"><span class="theme-swatch theme-${theme.id}" aria-hidden="true"><i></i><i></i><i></i></span><strong>${theme.name}</strong><small>${theme.note}</small></label>`).join('')}</div></fieldset>`;
}
function accountLinks(){
  const fields=[['discord','Discord','Username'],['youtube','YouTube','Channel URL or handle'],['twitch','Twitch','Channel URL or handle'],['tiktok','TikTok','Profile URL or handle']];
  return `<fieldset class="social-link-fields"><legend>Links</legend><p class="field-hint">Saved in this browser and shown on your profile as text, not a live link, until account services connect.</p>${fields.map(([key,label,placeholder])=>`<label for="link-${key}">${label}</label><input id="link-${key}" name="${key}" maxlength="80" value="${esc(state.links[key]||'')}" placeholder="${esc(placeholder)}">`).join('')}</fieldset>`;
}
function giftEditor(name){
  if(!state.friends.includes(name)){toast('Gifts go to friends on your list.');return;}
  const amounts=[25,50,100].map(amount=>`<label class="radio-pill"><input type="radio" name="amount" value="${amount}" ${amount===25?'checked':''}> <span>${amount} Alloy</span></label>`).join('');
  const items=state.savedAssets.filter(id=>marketplaceAssets.some(asset=>asset.id===id));
  modal('Send a gift to '+esc(name),`<form id="gift-form" class="gift-form" data-name="${esc(name)}"><p class="muted">Your preview balance is ${state.previewAlloy.toLocaleString()} Alloy. Gifts spend that demo balance or leave your collection, and cannot be undone.</p><fieldset class="gift-amounts"><legend>What are you sending?</legend><label class="radio-pill"><input type="radio" name="kind" value="alloy" checked> <span>Alloy</span></label>${items.length?`<label class="radio-pill"><input type="radio" name="kind" value="item"> <span>An accessory</span></label>`:''}</fieldset><fieldset class="gift-amounts"><legend>Amount</legend>${amounts}</fieldset>${items.length?`<label for="gift-item">Accessory</label><select id="gift-item" name="item">${items.map(id=>`<option value="${esc(id)}">${esc(itemName(id))}</option>`).join('')}</select>`:''}<p id="gift-error" class="form-error" role="alert"></p><div class="button-row">${button('close-dialog','Cancel','button')}<button class="button primary" type="submit">Send gift</button></div></form>`);
}
function docsPage(){
  const contract=[
    ['Discovery',[['GET','/v1/games','Published games with genre, rating, and live player counts.'],['GET','/v1/games/:id','One game with its creator, servers, and active sessions.'],['GET','/v1/games/:id/similar','Same-genre suggestions for recommendation rails.']]],
    ['Accounts and safety',[['POST','/v1/accounts','Create an account. Unverified accounts are removed after 30 days.'],['GET','/v1/users/:name','Public profile, links, badges, and presence.'],['GET','/v1/users/:name/friends','Friends with presence, paged.']]],
    ['Economy',[['GET','/v1/economy/balance','Authoritative Alloy balance for the signed-in account.'],['POST','/v1/economy/gifts','Send Alloy or an accessory to a friend.'],['POST','/v1/market/assets/:id/purchase','Buy an asset. Price and ownership are checked server-side.']]],
    ['Servers',[['POST','/v1/games/:id/servers','Request an on-demand sandbox. Returns the server and its resource ceiling.'],['GET','/v1/servers/:id','State, region, player count, and the scaled resource limit.'],['POST','/v1/servers/:id/join','Issue a launcher handoff ticket after access checks.']]],
  ];
  return `${pageHead('API documentation','The contract Metallic services will expose.')}
    <div class="notice"><span>${icon('docs',20)}<span><strong>Reference only</strong><small>No endpoint below is live. This is the agreed shape of the API so the website and backend build against the same names.</small></span></div>
    <div class="doc-grid">${contract.map(([title,rows])=>`<section class="panel api-group"><h2>${title}</h2><ul class="api-list">${rows.map(([method,endpoint,note])=>`<li><span class="api-method method-${method.toLowerCase()}">${method}</span><code>${esc(endpoint)}</code><p>${note}</p></li>`).join('')}</ul></section>`).join('')}</div>
    <section class="panel api-notes"><h2>Conventions</h2><ul class="policy-list"><li><strong>Auth</strong><span>A session cookie for browsers and a bearer token for services. Every write is authorised server-side.</span></li><li><strong>Errors</strong><span>JSON with <code>code</code>, <code>message</code>, and <code>requestId</code>. Retries reuse the same request id.</span></li><li><strong>Limits</strong><span>Per-account rate limits with <code>Retry-After</code>; lists are cursor paged.</span></li><li><strong>Versioning</strong><span>The path carries the version. Additive fields do not bump it.</span></li></ul></section>
    <section class="panel api-notes"><h2>Scale</h2><ul class="policy-list"><li><strong>Reads</strong><span>Catalog and game reads are cached at the edge and invalidated by version, so a popular release does not stampede the database.</span></li><li><strong>Writes</strong><span>Balances, gifts, and trades post to one authoritative service per account, which serialises them instead of trusting the browser.</span></li><li><strong>Sessions</strong><span>Servers are regional sandboxes with a hard ceiling; the fleet grows by adding regions, not by making one world bigger.</span></li><li><strong>Cost of scale</strong><span>Idle worlds cost nothing and only live sessions reserve resources, which is what keeps millions of accounts affordable.</span></li></ul></section>
    <p class="fine-print">This page is a planning contract, not a running service. Nothing here performs a request.</p>`;
}
function safetyPage(){
  const policies=[
    ['Verification','An account must verify an email address. An account still unverified 30 days after creation is deleted along with its drafts.'],
    ['Up to five accounts per person','A person may hold a maximum of five accounts. The limit belongs to the account service, so clearing browser data does not reset it.'],
    ['A ban covers every account','A ban records the person rather than one login. All linked accounts are banned together and cannot be used to start over.'],
    ['Shared networks are reviewed','Several accounts from one address are flagged for review. Households, schools, and internet cafés are expected, so a flag opens a check rather than an automatic ban.'],
    ['Names cannot be sniped','A username belongs to the account that completes verification first. Releasing a name starts a cooldown before anyone else can claim it.'],
    ['Moderation with reasons','Reports are triaged by category, every enforcement action carries the rule applied, and each ban has an appeal route.'],
  ];
  return `${pageHead('Safety','How Metallic is meant to keep accounts and worlds fair.')}
    <div class="notice"><span>${icon('safety',20)}<span><strong>Policy preview</strong><small>These rules describe the account service being built. This website cannot enforce them yet.</small></span></div>
    <div class="policy-grid">${policies.map(([title,text])=>`<article class="panel policy-card">${icon('safety',22)}<h3>${title}</h3><p>${text}</p></article>`).join('')}</div>
    <section class="panel api-notes"><h2>Reporting something</h2><ul class="policy-list"><li><strong>In a game</strong><span>Report from the player list or the game page. A report carries the server and the time.</span></li><li><strong>On a profile</strong><span>Report the profile or one link. Blocking hides both people from each other.</span></li><li><strong>Appeals</strong><span>Every ban notification carries an appeal route and the rule that was applied.</span></li></ul></section>
    <p class="fine-print">Nothing on this page submits a report. Reporting connects with the moderation service.</p>`;
}
function notFound() { return `${pageHead('Page not found','This world is still uncharted.')}${empty('Let’s get you back to exploring.','The page you’re looking for doesn’t exist.',link('home','Back to Home'))}`; }
function notificationItems() {
  return [
    ...(state.notifications?state.requests.map(name=>({id:'request-'+name,title:`${name} sent you a friend request`,description:'Find your next adventure together.',to:'friends?tab=requests',name})):[]),
    ...(state.updateNotifications?[{id:'welcome',title:'Welcome to Metallic',description:'Your friends, games, and creations in one place.',to:'home'}]:[]),
  ];
}
function updateNotificationPopover(open=notificationsOpen) {
  const popover=document.querySelector('#notification-popover');if(!popover)return;
  notificationsOpen=open;popover.hidden=!open;
  const toggle=document.querySelector('#notification-toggle');toggle?.setAttribute('aria-expanded',String(open));
  const items=notificationItems(), unread=items.filter(item=>!state.readNotifications.includes(item.id)).length;
  toggle?.querySelector('.notification-dot')?.remove();
  if(unread)toggle?.insertAdjacentHTML('beforeend','<span class="notification-dot"></span>');
  popover.innerHTML=`<div class="notification-popover-head"><div><h2>Notifications</h2><span>${unread} unread</span></div>${button('close-notifications',icon('close',17),'plain-icon','aria-label="Close notifications"')}</div>
    ${items.length?`<div class="notification-list">${items.map(item=>`<a class="notification-entry ${state.readNotifications.includes(item.id)?'read':''}" href="#/${item.to}" data-action="read-notification" data-id="${item.id}">${item.name?referenceAvatar(personInfo(item.name).avatar):`<span class="notification-symbol">${icon('bell',19)}</span>`}<span><strong>${esc(item.title)}</strong><small>${item.description}</small></span>${!state.readNotifications.includes(item.id)?'<i></i>':''}</a>`).join('')}</div>`:'<div class="notification-empty">'+icon('bell',30)+'<h3>You’re all caught up</h3><p>Your notifications will appear here.</p></div>'}
    <div class="notification-popover-footer">${button('read-all-notifications','Mark all as read','text-button',unread?'':'disabled')}${link('settings?section=notifications','Preferences','text-link')}</div>`;
}
function profileFriends(names, owner, mutual=[], mutualOnly=false) {
  const displayed=mutualOnly?mutual:names;
  return `<section class="profile-section profile-friends"><div class="section-top"><h2>Friends <span class="muted">(${names.length})</span></h2>${owner?link('friends','See all →','view-all'):''}</div>
    ${!owner?`<div class="profile-friend-filters">${link('profile?user='+encodeURIComponent(params.get('user')),'All friends',!mutualOnly?'selected':'')}${link('profile?user='+encodeURIComponent(params.get('user'))+'&friends=mutual',`Mutual friends (${mutual.length})`,mutualOnly?'selected':'')}</div>`:''}
    ${displayed.length?`<div class="friends-list">${displayed.map(name=>{const info=name===state.profile.name?{name,activity:state.activity?'Online':'Offline',avatar:0}:personInfo(name);return `<a class="friend" href="#/profile?user=${encodeURIComponent(name)}"><span class="friend-picture">${info.avatar===0?avatar():referenceAvatar(info.avatar)}${presenceDot(name)}</span><span class="friend-name">${esc(name)}</span><span class="friend-activity">${mutual.includes(name)?'Mutual friend':info.activity}</span></a>`;}).join('')}</div>`:`<div class="inline-empty">${mutualOnly?'You don’t share any friends yet.':'No friends to show yet.'}${owner?' '+link('friends?tab=find','Find people →','text-link'):''}</div>`}</section>`;
}
function settingsForm(section,fields) {
  return `<form id="settings-form" class="settings-form section-settings-form" data-section="${section}"><section class="panel"><h2>${settingsSections[section][0]}</h2><p class="settings-description">${settingsSections[section][1]}</p>${fields}</section><div class="settings-save"><span class="muted small-text">Saved to this browser</span><button type="submit" class="button primary">${icon('check',17)} Save changes</button></div></form>`;
}
function assetIcon(type) { return icon(type==='cosmetics'?'wardrobe':type==='games'?'play':type,48); }
function assetCard(asset,own=false) {
  return `<article class="asset-card"><button type="button" class="asset-cover color-${asset.color||'blue'}" data-action="asset-details" data-id="${esc(asset.id)}" aria-label="View ${esc(asset.name)}">${assetIcon(asset.type)}<span>${esc(asset.subcategory||creatorTypes[asset.type])}</span></button><div class="asset-card-body"><h3>${esc(asset.name)}</h3><p>By ${esc(asset.creator||state.profile.name)}</p><div class="asset-card-footer"><strong>${asset.price?icon('alloy',14)+' '+asset.price.toLocaleString():'Free'}</strong>${own?'<span class="tag">Listing draft</span>':button('save-asset',icon('heart',15),'plain-icon',`data-id="${esc(asset.id)}" aria-label="${state.savedAssets.includes(asset.id)?'Unsave':'Save'} ${esc(asset.name)}" aria-pressed="${state.savedAssets.includes(asset.id)}"`)}</div></div></article>`;
}
function assetEditor(asset,type='models',listing=false) {
  type=asset?.type||type;
  if(!Object.hasOwn(creatorTypes,type)||type==='games')type='models';
  const subtypes=type==='cosmetics'?cosmeticSlots:type==='models'?['Models','Meshes','Materials']:type==='audio'?['Music','Sound effects','Ambience']:['Studio tools','Utilities','Importers'];
  const initial=asset?.subcategory||(cosmeticSlots.includes(params.get('slot'))?params.get('slot'):subtypes[0]);
  modal(listing?'Prepare marketplace listing':asset?'Edit asset':'Create '+({models:'model',audio:'audio',plugins:'plugin',cosmetics:'cosmetic'}[type]),
    `<form id="asset-form" data-id="${esc(asset?.id||'')}" data-type="${type}" data-listing="${listing||asset?.listing?'1':'0'}"><label for="asset-name">Asset name</label><input id="asset-name" name="name" required maxlength="60" value="${esc(asset?.name||'')}" placeholder="Give your idea a name"><label for="asset-subtype">${type==='cosmetics'?'Cosmetic category':'Asset category'}</label><select id="asset-subtype" name="subcategory">${subtypes.map(subtype=>`<option ${subtype===initial?'selected':''}>${subtype}</option>`).join('')}</select><label for="asset-description">Description</label><textarea id="asset-description" name="description" rows="3" maxlength="500" placeholder="What can other creators make with it?">${esc(asset?.description||'')}</textarea>
    ${listing||asset?.listing?`<label for="asset-price">Price in Alloy</label><input id="asset-price" name="price" type="number" min="0" max="1000000" step="1" required value="${asset?.price||0}"><small class="field-hint">Set 0 for a free asset.</small><div class="listing-status"><span class="tag">Unpublished</span><p>This saves a listing draft. File delivery, licensing, publication, and checkout are not connected yet.</p></div>`:'<p class="fine-print">Save the asset details now. File uploads will be available with creator services.</p>'}
    <button type="submit" class="button primary full">${listing||asset?.listing?'Save listing draft':'Save asset draft'}</button></form>`);
}
function marketplace() {
  const mine=params.get('mine')==='1', saved=params.get('saved')==='1';
  let items=mine?state.creatorAssets.filter(asset=>asset.listing).map(asset=>({...asset,creator:state.profile.name})):marketplaceAssets;
  items=items.filter(asset=>assetMatches(asset,params)&&(!saved||state.savedAssets.includes(asset.id)));
  return `${pageHead('Creator Marketplace','Great games start with great building blocks.',link('create?tab=models','Manage your assets '+icon('arrow',17),'button'))}
    <section class="marketplace-hero"><div><span class="eyebrow">BY CREATORS, FOR CREATORS</span><h2>A head start on your next idea.</h2><p>Models, music, plugins, and wearables. Find the pieces that make your world yours.</p></div><div class="market-hero-art">${icon('models',62)}${icon('audio',48)}${icon('plugins',38)}</div></section>
    <div class="marketplace-modes">${link('marketplace','Discover assets',!mine&&!saved?'selected':'')}${link('marketplace?saved=1','Saved assets'+(state.savedAssets.length?' ('+state.savedAssets.length+')':''),saved?'selected':'')}${link('marketplace?mine=1','My listing drafts',mine?'selected':'')}</div>
    <form id="marketplace-search" class="marketplace-filters"><div class="market-search">${icon('search',18)}<input name="q" type="search" aria-label="Search assets" placeholder="Search assets" value="${esc(params.get('q')||'')}"></div><label>Category<select name="type" id="market-type"><option value="">All assets</option>${Object.entries(creatorTypes).filter(([key])=>key!=='games').map(([key,label])=>`<option value="${key}" ${params.get('type')===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Price<select name="price" id="market-price"><option value="">Any price</option><option value="free" ${params.get('price')==='free'?'selected':''}>Free</option><option value="paid" ${params.get('price')==='paid'?'selected':''}>Paid</option></select></label><button type="submit" class="button">Search</button></form>
    ${params.get('type')==='cosmetics'?`<div class="cosmetic-slots" role="group" aria-label="Marketplace cosmetic categories">${button('market-slot','All cosmetics',!params.get('slot')?'selected':'','data-value=""')}${cosmeticSlots.map(slot=>button('market-slot',slot,params.get('slot')===slot?'selected':'',`data-value="${slot}"`)).join('')}</div>`:''}
    <div class="section-top"><h2>${mine?'Your listing drafts':saved?'Saved assets':'Find your next building block'}</h2><span class="result-count" role="status">${items.length} asset${items.length===1?'':'s'}</span></div><div class="marketplace-grid">${items.map(asset=>assetCard(asset,mine)).join('')}</div>
    ${!items.length?empty(mine?'No listing drafts yet.':saved?'Keep your favorite assets close.':'No matching assets.',mine?'Create an asset in the creator hub, then prepare its listing.':saved?'Save an asset using the heart to find it here.':'Try another search or category.',link(mine?'create?tab=models':'marketplace',mine?'Open creator hub':'Browse all assets')):''}
    <p class="fine-print">Sample marketplace. Prices are illustrative. Checkout, asset downloads, and public sales are not available in this preview.</p>`;
}
function preferenceEditor() {
  modal('Make discovery yours',`<p class="muted">Choose the genres you enjoy. Your favorite games help us find more, too.</p><form id="preference-form"><fieldset class="genre-preferences"><legend>Your favorite genres</legend><div>${genres.map(genre=>`<label><input type="checkbox" name="genres" value="${genre}" ${state.preferredGenres.includes(genre)?'checked':''}><span>${genre}</span></label>`).join('')}</div></fieldset><p class="fine-print">Preferences are saved in this browser.</p><button type="submit" class="button primary full">Save preferences</button></form>`);
}
function creatorLink(gameId) {
  const owner=ownerForGame(gameId);
  return link(owner.type==='group'?'groups/'+owner.id:'profile?user='+encodeURIComponent(owner.id),esc(owner.name),'creator-owner-link');
}
function playerPreview(name,serverId,index) {
  const tooltip='player-'+serverId+'-'+index;
  return `<a class="server-player" href="#/profile?user=${encodeURIComponent(name)}" aria-label="${esc(name)}" aria-describedby="${tooltip}" title="${esc(name)}">${name===state.profile.name?avatar():referenceAvatar(personInfo(name).avatar)}<span class="player-tooltip" id="${tooltip}" role="tooltip">${esc(name)}</span></a>`;
}
function serverCard(server) {
  const access=serverAccess(server,state);
  return `<article class="server-card"><div class="server-card-header"><div><h3>${esc(server.name)}</h3><p><span class="server-state ${server.active?'active':''}"></span>${server.mine?'Your preview reservation':server.region} <span>· ${server.players.length}/${server.capacity} players</span></p></div><span class="tag">${server.visibility==='private'?'Invite only':'Public'}</span></div>
    <div class="server-card-content"><div class="server-player-list">${server.players.length?server.players.map((name,index)=>playerPreview(name,server.id,index)).join(''):'<span class="server-empty-players">Ready for your next gathering.</span>'}</div><div class="server-card-actions">${server.mine?button('manage-server','Configure','button small',`data-id="${server.id}"`):''}${button('join-server',access.allowed?(server.mine?'Preview join':'Join server'):access.reason,`button ${access.allowed?'primary':''} small`,`data-id="${server.id}" data-game="${server.gameId}" ${access.allowed?'':'disabled'}`)}</div></div>
    ${server.mine?`<p class="server-access-note">${server.visibility==='public'?'Anyone can join when the server is running.':server.allowFriends?'Your friends and invited players can join.':server.invited.length+' invited player'+(server.invited.length===1?'':'s')+' · Only you and invited players can join.'} This reservation is a local preview.</p>`:''}</article>`;
}
function gameFriends(gameId) {
  const playing=friendsPlaying(state,gameId), servers=sampleServers(gameId);
  return `<section class="game-friends-section"><div class="section-top"><h2>Friends playing <span class="muted">(${playing.length})</span></h2>${link('friends','All friends →','view-all')}</div>${playing.length?`<div class="playing-friends-grid">${playing.map(session=>{const access=friendJoinAccess(state,session,servers.find(server=>server.id===session.serverId));return `<article class="playing-friend"><a href="#/profile?user=${encodeURIComponent(session.name)}">${referenceAvatar(personInfo(session.name).avatar)}<span><strong>${esc(session.name)}</strong><small>${session.joinsEnabled?'In a public server':'Joins are turned off'}</small></span></a>${button('join-friend',access.allowed?'Join friend':access.reason,`button ${access.allowed?'primary':''} small`,`data-name="${session.name}" ${access.allowed?'':'disabled'}`)}</article>`;}).join('')}</div>`:'<div class="inline-empty">None of your friends are playing this game right now.</div>'}</section>`;
}
function serverEditor(gameId,existing) {
  const game=games.find(game=>game.id===(existing?.gameId||gameId));if(!game)return;
  const affordable=state.previewAlloy>=SERVER_PRICE;
  modal(existing?'Configure your server':'Create private server',`<p class="muted">${esc(game.title)}</p><form id="server-form" data-game="${game.id}" data-id="${existing?.id||crypto.randomUUID()}" data-editing="${existing?'1':'0'}"><label for="server-name">Server name</label><input id="server-name" name="name" required maxlength="40" placeholder="Your gathering place" value="${esc(existing?.name||'')}"><fieldset class="server-visibility"><legend>Who can join?</legend><label><input type="radio" name="visibility" value="private" ${!existing||existing.visibility==='private'?'checked':''}><span><strong>Private</strong><small>Only you and the people you invite.</small></span></label><label><input type="radio" name="visibility" value="public" ${existing?.visibility==='public'?'checked':''}><span><strong>Public</strong><small>Anyone can find and join the server.</small></span></label></fieldset><div class="private-access-options" ${existing?.visibility==='public'?'hidden':''}><label class="checkbox-label"><input type="checkbox" name="allowFriends" ${existing?.allowFriends?'checked':''}> Allow all of my friends</label>${state.friends.length?`<fieldset class="server-invites"><legend>Invite specific friends</legend>${state.friends.map(name=>`<label><input type="checkbox" name="invited" value="${esc(name)}" ${existing?.invited.includes(name)?'checked':''}>${referenceAvatar(personInfo(name).avatar)}<span>${esc(name)}</span></label>`).join('')}</fieldset>`:''}</div>
    <div class="server-cost-summary"><span>${existing?'Configuration cost':'Creation cost'}</span><strong>${existing?'No additional Alloy':SERVER_PRICE+' Alloy'}</strong><span>Preview balance</span><strong>${state.previewAlloy.toLocaleString()} Alloy</strong></div><p class="fine-print">${existing?'Update your local reservation.':'Creation uses the demo Alloy balance only.'} No live server is started.</p><p class="form-error" id="server-form-error" role="alert"></p><button type="submit" class="button primary full" ${!existing&&!affordable?'disabled':''}>${existing?'Save server settings':'Create — '+SERVER_PRICE+' Alloy'}</button>${!existing&&!affordable?'<p class="form-error">Not enough preview Alloy. '+link('alloy','View Alloy store','text-link')+'</p>':''}</form>`);
}
function groupEmblem(group,size='') { return `<span class="group-emblem group-color-${group.color||'silver'} ${size}" aria-hidden="true">${esc(group.emblem||group.name[0].toUpperCase())}</span>`; }
function groupAction(group) {
  if(group.mine)return button('manage-group','Manage group','button',`data-id="${group.id}"`);
  if(state.groupMemberships.includes(group.id))return button('leave-group',icon('check',16)+' Leave group','button',`data-id="${group.id}"`);
  if(state.groupRequests.includes(group.id))return button('cancel-group-request','Cancel request','button',`data-id="${group.id}"`);
  return button('join-group',group.joinPolicy==='approval'?'Request to join':'Join group','button primary',`data-id="${group.id}"`);
}
function groupsPage() {
  const mine=params.get('tab')==='mine', query=(params.get('q')||'').trim().toLowerCase(), category=params.get('category')||'All';
  const groups=getGroups(state).filter(group=>(!mine||group.mine||state.groupMemberships.includes(group.id)||state.groupRequests.includes(group.id))&&(!query||`${group.name} ${group.description}`.toLowerCase().includes(query))&&(category==='All'||group.category===category));
  return `${pageHead('Groups','Find your people. Build something together.',button('new-group',icon('create',17)+' Create group','button primary'))}<section class="groups-intro"><div><span class="eyebrow">A SHARED INTEREST. A SHARED WORLD.</span><h2>Good ideas grow together.</h2><p>Meet people who love what you love—or start a group and create your next game as a team.</p></div><div class="groups-intro-emblems">${getGroups(state).slice(0,3).map(group=>groupEmblem(group)).join('')}</div></section><nav class="group-browse-tabs" aria-label="Group browsing">${link('groups','Discover groups',!mine?'selected':'')}${link('groups?tab=mine','My groups',mine?'selected':'')}</nav><form id="group-search" class="group-search-form"><div class="group-search-input">${icon('search',18)}<input type="search" name="q" aria-label="Search groups" placeholder="Find a group" value="${esc(params.get('q')||'')}"></div><label>Interest<select name="category"><option value="All">All interests</option>${groupCategories.map(value=>`<option ${category===value?'selected':''}>${value}</option>`).join('')}</select></label><button type="submit" class="button">Search</button></form><div class="section-top"><h2>${mine?'Your communities':'Find a place to belong'}</h2><span class="result-count" role="status">${groups.length} group${groups.length===1?'':'s'}</span></div><div class="group-grid">${groups.map(group=>`<article class="group-card"><a href="#/groups/${group.id}" class="group-card-link">${groupEmblem(group)}<span class="group-category">${group.category}</span><h3>${esc(group.name)}</h3><p>${esc(group.description)}</p></a><div class="group-card-footer"><span>${groupMembers(group,state).length} member${groupMembers(group,state).length===1?'':'s'}</span>${link('groups/'+group.id,'View group →','text-link')}</div>${group.mine?'<span class="group-owned">Owner</span>':state.groupMemberships.includes(group.id)?'<span class="group-owned">Joined</span>':state.groupRequests.includes(group.id)?'<span class="group-owned">Request pending</span>':''}</article>`).join('')}</div>${!groups.length?empty('Your people are out there.','Try another search, discover a group, or start your own.',button('new-group','Create a group','button primary')):''}<p class="fine-print">Sample communities and local group drafts. Membership changes stay in this browser.</p>`;
}
function groupPage() {
  const group=findGroup(state,route.split('/')[1]);if(!group)return notFound();
  const members=groupMembers(group,state), tab=['about','games','members'].includes(params.get('tab'))?params.get('tab'):'about';
  const published=games.filter(game=>group.games.includes(game.id)), drafts=state.projects.filter(project=>project.groupId===group.id);
  return `${link('groups','← All groups','text-link')}<section class="group-cover group-color-${group.color}"><span>GROUP · ${group.category.toUpperCase()}</span><div>${esc(group.emblem)}</div></section><header class="group-profile-header">${groupEmblem(group,'large')}<div><h1>${esc(group.name)}</h1><p>By ${link('profile?user='+encodeURIComponent(group.owner),esc(group.owner),'text-link')} <span>· ${members.length} members</span></p></div><div>${groupAction(group)}</div></header><nav class="group-detail-tabs" aria-label="Group sections">${[['about','About'],['games','Games ('+(published.length+drafts.length)+')'],['members','Members ('+members.length+')']].map(([value,label])=>link('groups/'+group.id+(value==='about'?'':'?tab='+value),label,tab===value?'selected':'')).join('')}</nav>
    ${tab==='about'?`<div class="group-about-layout"><section><div class="group-announcement"><span class="eyebrow">GROUP SHOUT</span><p>${esc(group.shout)}</p><span>From ${esc(group.owner)}</span></div><section class="panel group-description"><h2>About this group</h2><p>${esc(group.description)||'Tell your members what brings this group together.'}</p><div class="group-facts"><div><span>Interest</span><strong>${group.category}</strong></div><div><span>Membership</span><strong>${group.joinPolicy==='approval'?'Approval required':'Open to everyone'}</strong></div></div></section></section><aside class="panel group-build-together">${icon('create',30)}<h2>Create as a group</h2><p>Give your next game a home, with your group as its creator.</p>${group.mine?button('new-group-game','Create group game','button primary full',`data-id="${group.id}"`):'<p class="fine-print">The group owner manages game creation and publishing.</p>'}</aside></div>`:''}
    ${tab==='games'?`<div class="section-top"><div><h2>Group games</h2><p class="section-sub">Worlds made by ${esc(group.name)}.</p></div>${group.mine?button('new-group-game','New group game','button primary small',`data-id="${group.id}"`):''}</div>${published.length?`<div class="game-grid">${published.map(card).join('')}</div>`:''}${drafts.length?`<h3 class="group-drafts-title">In development</h3><div class="group-draft-list">${drafts.map(project=>`<article class="creation-row"><span>${icon('create',20)} ${esc(project.name)} <small class="tag">Draft</small></span>${button('edit-project','Edit draft','button small',`data-id="${project.id}"`)}</article>`).join('')}</div>`:''}${!published.length&&!drafts.length?empty('A blank canvas for your group.','There are no published games here yet.',group.mine?button('new-group-game','Create group game','button primary',`data-id="${group.id}"`):''):''}`:''}
    ${tab==='members'?`<div class="section-top"><h2>Members</h2><span class="muted small-text">Community roles</span></div><div class="group-member-grid">${members.map(name=>`<a class="group-member-card" href="#/profile?user=${encodeURIComponent(name)}">${name===state.profile.name?avatar():referenceAvatar(personInfo(name).avatar)}<strong>${esc(name)}</strong><span>${esc(groupRole(group,name))}</span></a>`).join('')}</div>`:''}<p class="fine-print">${group.mine?'Your group is a browser-local preview. Live collaboration and publishing are not connected.':'Sample group. Joining or requesting membership does not send a message to real people.'}</p>`;
}
function groupEditor(existing) {
  modal(existing?'Manage your group':'Create a group',`<p class="muted">A place for a shared interest or your next group game.</p><form id="group-form" data-id="${existing?.id||''}"><label for="group-name">Group name</label><input id="group-name" name="name" required minlength="3" maxlength="40" value="${esc(existing?.name||'')}" placeholder="Give your community a name"><label for="group-description">Description</label><textarea id="group-description" name="description" rows="3" maxlength="500" placeholder="What brings your group together?">${esc(existing?.description||'')}</textarea><label for="group-category">Shared interest</label><select id="group-category" name="category">${groupCategories.map(category=>`<option ${existing?.category===category||!existing&&category==='Creating'?'selected':''}>${category}</option>`).join('')}</select><label for="group-membership">Membership</label><select id="group-membership" name="joinPolicy"><option value="open" ${existing?.joinPolicy!=='approval'?'selected':''}>Open — anyone can join</option><option value="approval" ${existing?.joinPolicy==='approval'?'selected':''}>Approval — request to join</option></select><p class="fine-print">Your group is saved locally. Invitations, shared editing, and publishing will connect with the live platform.</p><button type="submit" class="button primary full">${existing?'Save group':'Create group'}</button></form>`);
}
function previewServerJoin(server,friend) {
  const game=games.find(game=>game.id===server.gameId);
  modal(friend?'Join '+esc(friend):server.mine?'Preview your reservation':'Join server',`<div class="join-game-preview"><img src="${game.art}" alt=""><div><h3>${esc(game.title)}</h3><p>${esc(server.name)}</p><span class="tag">${server.players.length}/${server.capacity} players</span></div></div><p class="muted">${server.mine?'Your reservation is saved in this browser. It is not a running game server.':'This previews joining the selected session. The launcher handoff will connect when live gameplay is available.'}</p>${link('download',icon('download',17)+' View launcher availability','button primary full')}`);
}

function focusIdentity(element=document.activeElement) {
  if(!element || element===document.body)return null;
  return { id:element.id, action:element.dataset?.action, value:element.dataset?.value,
    name:element.dataset?.name, item:element.dataset?.id, field:element.getAttribute('name') };
}
function restoreFocus(identity) {
  if(!identity)return;
  const target=identity.id ? document.getElementById(identity.id) : [...app.querySelectorAll('button,a,input,select,textarea')].find(el=>
    identity.action ? el.dataset.action===identity.action&&el.dataset.value===identity.value&&el.dataset.name===identity.name&&el.dataset.id===identity.item : identity.field&&el.getAttribute('name')===identity.field);
  if(target&&!target.disabled)target.focus({preventScroll:true});
  else document.querySelector('#main')?.focus({preventScroll:true});
}
function render(preserveFocus=true) {
  applyTheme(state);
  closeFriendPreview();
  const focus=preserveFocus?focusIdentity():null;
  ({route,params,category,sort,friendTab}=readRoute(location.hash));
  const pages={'':landing,home,explore,search:searchPage,login:auth,signup:auth,download,wardrobe,create,alloy,profile,settings,friends,marketplace,groups:groupsPage,docs:docsPage,safety:safetyPage,trades:tradesPage,community:communityPage};
  const page=Object.hasOwn(pages,route)?pages[route]:/^game\/\d+$/.test(route)?gamePage:route.startsWith('groups/')?groupPage:notFound;
  const titles={'':'A world of possibilities',home:'Home',explore:'Explore',search:'Search',signup:'Sign up',login:'Log in',download:'Download',wardrobe:'Wardrobe',create:'Creator hub',alloy:'Buy Alloy',profile:'Profile',settings:'Settings',friends:'Friends',marketplace:'Creator Marketplace',groups:'Groups',docs:'API documentation',safety:'Safety',trades:'Trading',community:'Community'};
  const game=games.find(g=>route===`game/${g.id}`);
  document.title=`${(route.startsWith('groups/')?findGroup(state,route.split('/')[1])?.name:null) || game?.title || (Object.hasOwn(titles,route)?titles[route]:'Page not found')} | Metallic`;
  document.body.classList.remove('nav-open');
  notificationsOpen=false;
  app.innerHTML=shell(page(),['','login','signup'].includes(route));
  if(route==='settings')settingsDirty=false;
  updateShelfControls();
  restoreFocus(focus);
}
function navigate(destination) {
  if(location.hash==='#'+destination)render(); else location.hash=destination;
}
function setQuery(changes) {
  // The URL updates before hashchange fires; use it so rapid edits cannot lose filters.
  const current=readRoute(location.hash);
  navigate(routeWithParams(current.route,current.params,changes));
}
function setMenu(open) {
  const sidebar=document.querySelector('#sidebar');if(!sidebar)return;
  sidebar.classList.toggle('open',open);
  document.querySelector('.mobile-backdrop').classList.toggle('open',open);
  document.querySelector('.mobile-menu').setAttribute('aria-expanded',String(open));
  document.body.classList.toggle('nav-open',open);
  document.querySelector('#main').inert=open;
  const bottom=document.querySelector('.mobile-tabs');if(bottom)bottom.inert=open;
  if(open)sidebar.querySelector('a').focus();else document.querySelector('.mobile-menu').focus();
}
function updateShelfControls() {
  document.querySelectorAll('[data-action="scroll"]').forEach(button=>{
    const shelf=document.getElementById(button.dataset.target);if(!shelf)return;
    button.disabled=button.dataset.direction==='-1'?shelf.scrollLeft<=2:shelf.scrollLeft+shelf.clientWidth>=shelf.scrollWidth-2;
  });
}
function closeSuggestions() {
  const results=document.querySelector('#search-suggestions');if(results)results.hidden=true;
  document.querySelector('#site-search')?.setAttribute('aria-expanded','false');
}
function searchPerson(person) {
  return `<a class="search-person-card" href="#/profile${person.own?'':'?user='+encodeURIComponent(person.name)}">${person.own?avatar():referenceAvatar(personInfo(person.name).avatar)}<span><strong>${esc(person.name)}</strong><small>@${esc(person.name)}${person.own?' · You':state.friends.includes(person.name)?' · Friend':''}</small></span>${icon('arrow',16)}</a>`;
}
function searchGroup(group) {
  return `<a class="search-group-card" href="#/groups/${group.id}">${groupEmblem(group)}<span><strong>${esc(group.name)}</strong><small>${esc(group.category)} · ${groupMembers(group,state).length} member${groupMembers(group,state).length===1?'':'s'}</small></span>${icon('arrow',16)}</a>`;
}
function searchPage() {
  const query=params.get('q')||'', results=searchSite(state,query), labels={all:'All',games:'Games',people:'People',groups:'Groups'}, tab=Object.hasOwn(labels,params.get('type'))?params.get('type'):'all';
  const total=Object.values(results).reduce((sum,items)=>sum+items.length,0);
  const section=(type,body)=>results[type].length&&(tab==='all'||tab===type)?`<section class="site-search-section"><div class="section-top"><h2>${labels[type]} <span class="muted">(${results[type].length})</span></h2></div>${body}</section>`:'';
  return `${pageHead('Search',query?'Results for “'+esc(query)+'”':'Find games, people, and communities.')}<nav class="site-search-tabs" aria-label="Search categories">${Object.entries(labels).map(([type,label])=>link('search?'+new URLSearchParams({q:query,...(type==='all'?{}:{type})}),label+' <span>'+(type==='all'?total:results[type].length)+'</span>',tab===type?'selected':'')).join('')}</nav><p class="search-result-count" role="status">${tab==='all'?total:results[tab].length} result${(tab==='all'?total:results[tab].length)===1?'':'s'}${query?' for “'+esc(query)+'”':''}</p>${section('games',`<div class="game-grid">${results.games.map(card).join('')}</div>`)}${section('people',`<div class="search-people-grid">${results.people.map(searchPerson).join('')}</div>`)}${section('groups',`<div class="search-groups-grid">${results.groups.map(searchGroup).join('')}</div>`)}${!query.trim()?empty('What are you looking for?','Search for a game title, a player’s username, or a group in the top bar.'):!(tab==='all'?total:results[tab].length)?empty('No '+(tab==='all'?'results':labels[tab].toLowerCase())+' found.','Try another name or choose a different search category.'):''}`;
}
function suggestSearch(query) {
  const results=document.querySelector('#search-suggestions');if(!results)return;
  if(!query.trim()){closeSuggestions();return;}
  const matches=searchSite(state,query);
  results.innerHTML=`${matches.games.length?'<span class="suggestions-label">Games</span>'+matches.games.slice(0,3).map(g=>`<a href="#/game/${g.id}"><img src="${g.art}" alt=""><span><strong>${esc(g.title)}</strong><small>${g.genre} · ${g.playing} playing</small></span>${icon('arrow',14)}</a>`).join(''):''}${matches.people.length?'<span class="suggestions-label">People</span>'+matches.people.slice(0,3).map(searchPerson).join(''):''}${matches.groups.length?'<span class="suggestions-label">Groups</span>'+matches.groups.slice(0,3).map(searchGroup).join(''):''}${!Object.values(matches).some(items=>items.length)?'<p>No matches yet. Try another name.</p>':''}<a class="all-results" href="#/search?q=${encodeURIComponent(query.trim())}">${icon('search',16)} See all results</a>`;
  results.hidden=false;document.querySelector('#site-search').setAttribute('aria-expanded','true');
}
let activeFriendTrigger=null, friendCloseTimer;
function closeFriendPreview() {
  clearTimeout(friendCloseTimer);
  document.querySelector('#friend-activity-popover')?.hidePopover();
  activeFriendTrigger?.querySelector('.activity-trigger')?.setAttribute('aria-expanded','false');
  activeFriendTrigger=null;
}
function showFriendPreview(trigger) {
  const menu=document.querySelector('#friend-activity-popover');if(!menu||!trigger)return;
  clearTimeout(friendCloseTimer);
  if(activeFriendTrigger===trigger&&menu.matches(':popover-open'))return;
  closeFriendPreview();activeFriendTrigger=trigger;
  const name=trigger.dataset.friendPreview, info=personInfo(name), activity=friendActivity(state,name);
  menu.innerHTML=`<span class="friend-popover-label">${esc(name)} · ${activity?'Playing now':esc(info.activity)}</span>${activity?`<a class="friend-playing-game" href="#/game/${activity.game.id}"><img src="${activity.game.art}" alt=""><span><strong>${esc(activity.game.title)}</strong><small>${esc(activity.game.genre)}</small></span></a><div class="friend-popover-actions">${link('profile?user='+encodeURIComponent(name),'View profile','text-link')}${button('join-friend',activity.access.allowed?'Join':activity.access.reason,'button primary small',`data-name="${esc(name)}" ${activity.access.allowed?'':'disabled'}`)}</div>`:`<p>${info.activity==='Offline'?'This friend is offline.':'This friend isn’t playing a game right now.'}</p>${link('profile?user='+encodeURIComponent(name),'View profile →','text-link')}`}`;
  menu.setAttribute('aria-label',name+' activity');menu.showPopover();
  trigger.querySelector('.activity-trigger').setAttribute('aria-expanded','true');
  const anchor=trigger.getBoundingClientRect(), rect=menu.getBoundingClientRect();
  menu.style.left=Math.max(10,Math.min(anchor.left+anchor.width/2-rect.width/2,innerWidth-rect.width-10))+'px';
  menu.style.top=Math.max(10,Math.min(anchor.bottom+7,innerHeight-rect.height-10))+'px';
}
function scheduleFriendClose(related) {
  const menu=document.querySelector('#friend-activity-popover');
  if(related&&(activeFriendTrigger?.contains(related)||menu?.contains(related)))return;
  clearTimeout(friendCloseTimer);friendCloseTimer=setTimeout(closeFriendPreview,140);
}
function projectEditor(project,groupId='') {
  modal(project?'Edit game':'Create a game',`<p class="muted">${project?'Shape your idea before you start building.':'Every great world starts with an idea.'}</p><form id="project-form" data-id="${esc(project?.id||'')}"><label for="project-name">Game name</label><input id="project-name" name="name" required maxlength="60" value="${esc(project?.name||'')}" placeholder="My first world"><label for="project-owner">Creator</label><select id="project-owner" name="groupId"><option value="">${esc(state.profile.name)} · Personal game</option>${state.myGroups.map(group=>`<option value="${group.id}" ${(project?.groupId||groupId)===group.id?'selected':''}>${esc(group.name)} · Group game</option>`).join('')}</select><label for="project-template">Starting template</label><select id="project-template" name="template">${templates.map(t=>`<option ${project?.template===t?'selected':''}>${t}</option>`).join('')}</select><label for="project-description">Description</label><textarea id="project-description" name="description" maxlength="500" rows="3" placeholder="What will players discover?">${esc(project?.description||'')}</textarea><p class="fine-print">Saved as a local draft. Studio editing and publishing are coming later.</p><button class="button primary full" type="submit">${project?'Save draft':'Create draft'} ${icon('arrow',17)}</button></form>`);
}
const scrollPositions=new Map();
let lastHash=location.hash;
window.addEventListener('hashchange',()=>{
  if(location.hash===lastHash)return;
  const next=readRoute(location.hash), previous=readRoute(lastHash);
  if(settingsDirty && previous.route==='settings') {
    const destination=location.hash.slice(1);
    history.replaceState(null,'',lastHash);
    modal('Leave without saving?',`<p class="muted">Your profile changes have not been saved.</p>${button('discard-settings','Discard changes','button danger',`data-value="${esc(destination)}"`)} ${button('close-dialog','Keep editing','button')}`);
    return;
  }
  const samePage=next.route===previous.route && next.params.get('user')===previous.params.get('user');
  const previousScroll=scrollY, previousFocus=samePage?focusIdentity():null;
  scrollPositions.set(lastHash,previousScroll);lastHash=location.hash;
  if(dialog.open)dialog.close();
  render(false);
  window.scrollTo(0,samePage?previousScroll:(scrollPositions.get(lastHash)||0));
  if(samePage)restoreFocus(previousFocus);else document.querySelector('#main').focus({preventScroll:true});
});
document.addEventListener('click',async e=>{
  if(e.target.closest('.skip-link')){e.preventDefault();document.querySelector('#main').focus();return;}
  if(!e.target.closest('#search-form'))closeSuggestions();
  if(!e.target.closest('[data-friend-preview],#friend-activity-popover'))closeFriendPreview();
  if(!e.target.closest('#notification-toggle,#notification-popover')&&notificationsOpen)updateNotificationPopover(false);
  const navigation=e.target.closest('a[href^="#/"]');
  if(navigation&&settingsDirty&&route==='settings'){
    e.preventDefault();modal('Leave without saving?',`<p class="muted">Your profile changes have not been saved.</p>${button('discard-settings','Discard changes','button danger',`data-value="${esc(navigation.getAttribute('href').slice(1))}"`)} ${button('close-dialog','Keep editing','button')}`);return;
  }
  if(navigation&&document.body.classList.contains('nav-open')){
    // Navigate explicitly before the hidden drawer can cancel the link's activation.
    e.preventDefault();const destination=navigation.getAttribute('href').slice(1);setMenu(false);navigate(destination);
  }
  const el=e.target.closest('[data-action]');if(!el)return;
  const {action,value,id,name}=el.dataset;
  switch(action){
    case 'menu':setMenu(!document.querySelector('#sidebar').classList.contains('open'));break;
    case 'close-dialog':dialog.close();break;
    case 'discard-settings':settingsDirty=false;dialog.close();navigate(value);break;
    case 'notifications':closeSuggestions();updateNotificationPopover(!notificationsOpen);if(notificationsOpen)document.querySelector('#notification-popover button')?.focus();break;
    case 'close-notifications':updateNotificationPopover(false);document.querySelector('#notification-toggle')?.focus();break;
    case 'read-notification':if(!state.readNotifications.includes(id))state.readNotifications.push(id);saveState(storage,state);updateNotificationPopover(false);break;
    case 'read-all-notifications':state.readNotifications=[...new Set([...state.readNotifications,...notificationItems().map(item=>item.id)])];saveState(storage,state);updateNotificationPopover(true);document.querySelector('#notification-popover button')?.focus();break;
    case 'preferences':preferenceEditor();break;
    case 'claim-daily':{const result=claimDaily(state);if(result.ok){persist('Claimed '+result.amount+' Alloy.');render();}else toast(result.error);break;}
    case 'gift':giftEditor(name);break;
    case 'clear-history':state.playHistory=[];persist('Play history cleared.');render();break;
    case 'claim-quest':{const result=claimQuest(state,value);if(result.ok){persist('Quest claimed: +'+result.amount+' Alloy.');render();}else toast(result.error);break;}
    case 'trade':tradeEditor(name);break;
    case 'trade-cancel':if(cancelTrade(state,id)){persist('Trade closed.');render();}break;
    case 'trade-accept':if(acceptTrade(state,id)){persist('Trade accepted. Your preview balance and collection are updated.');render();}break;
    case 'block':{
      if(state.blocked.includes(name)){state.blocked=state.blocked.filter(value=>value!==name);persist(name+' is unblocked in this preview.');}
      else{state.blocked=[...state.blocked,name];updateFriendship(state,'remove',name);persist(name+' is blocked. Friend requests and trades stop here.');}
      render();break;
    }
    case 'report':reportEditor(name);break;
    case 'copy-community':copyText('metallic.gg/discord','Invite code copied.');break;
    case 'theme':if(isTheme(value)){state.theme=value;applyTheme(state);const choice=el.closest('.theme-choice');document.querySelectorAll('.theme-choice').forEach(node=>node.classList.toggle('selected',node===choice));markSettingsDirty();}break;
    case 'hide-game':if(games.some(game=>game.id===id)){if(!state.hiddenGames.includes(id))state.hiddenGames.push(id);persist('We’ll recommend other games.');render();}break;
    case 'reset-hidden':state.hiddenGames=[];persist('Hidden games restored to discovery.');render();break;
    case 'toggle-filters':{const panel=el.closest('.explore-filters');const open=panel.classList.toggle('filters-open');el.setAttribute('aria-expanded',String(open));break;}
    case 'new-asset':assetEditor(null,value);break;
    case 'edit-asset':case 'prepare-listing':{const asset=state.creatorAssets.find(asset=>asset.id===id);if(asset)assetEditor(asset,asset.type,action==='prepare-listing');break;}
    case 'market-slot':setQuery({slot:value||null});break;
    case 'save-asset':if(marketplaceAssets.some(asset=>asset.id===id)){state.savedAssets=state.savedAssets.includes(id)?state.savedAssets.filter(value=>value!==id):[...state.savedAssets,id];persist(state.savedAssets.includes(id)?'Asset saved.':'Asset removed from saved items.');render();}break;
    case 'asset-details':{const asset=marketplaceAssets.find(asset=>asset.id===id)||state.creatorAssets.find(asset=>asset.id===id);if(!asset)break;const own=state.creatorAssets.some(item=>item.id===id);modal(esc(asset.name),`<div class="asset-detail-art color-${asset.color||'blue'}">${assetIcon(asset.type)}</div><p class="muted">${esc(creatorTypes[asset.type])} · ${esc(asset.subcategory)}</p><p>${esc(asset.description)||'No description yet.'}</p><div class="asset-detail-price"><strong>${asset.price?asset.price.toLocaleString()+' Alloy':'Free'}</strong><span class="tag">${own?'Unpublished listing':'Sample listing'}</span></div><p class="fine-print">Asset files, license terms, and checkout will be available when the marketplace launches.</p>${own?button('prepare-listing','Edit listing','button primary full',`data-id="${esc(id)}"`):'<button class="button primary full" disabled>Checkout coming later</button>'}`);break;}
    case 'scroll':{const shelf=document.getElementById(el.dataset.target);shelf.scrollBy({left:Number(el.dataset.direction)*Math.max(240,shelf.clientWidth*.8),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});break;}
    case 'dismiss-launcher':state.launcherDismissed=true;persist('Launcher notice hidden. Downloads are always in the menu.');render();break;
    case 'category':setQuery({category:value==='All'?null:value});break;
    case 'clear-search':navigate('/explore');break;
    case 'favorite':if(games.some(g=>g.id===id)){state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];persist(state.favorites.includes(id)?'Added to your favorites.':'Removed from favorites.');render();}break;
    case 'play':if(recordPlay(state,id))saveState(storage,state);modal('Your next adventure is on its way',`<p class="muted">${esc(games.find(g=>g.id===id)?.title||'This game')} will open in the Metallic launcher when live gameplay is available.</p><p>This is a preview game. No game has been launched.</p>${link('download',icon('download',18)+' View launcher availability','button primary full')}`);break;
    case 'share':try{await navigator.clipboard.writeText(location.href);toast('Game link copied.');}catch{modal('Share this game',`<label for="share-url">Game link</label><input id="share-url" class="share-url" readonly value="${esc(location.href)}"><p class="fine-print">Copy this link. Viewers still need access to this private preview.</p>`);document.querySelector('#share-url').select();}break;
    case 'password':{const input=document.querySelector('#password');const show=input.type==='password';input.type=show?'text':'password';el.textContent=show?'Hide':'Show';el.setAttribute('aria-label',show?'Hide password':'Show password');el.setAttribute('aria-pressed',String(show));break;}
    case 'recovery':modal('Account recovery',`<p class="muted">Account recovery will be available when live accounts launch. Preview logins do not create an account or store a password.</p>${link('home','Explore the preview','button primary full')}`);break;
    case 'platform':platform=value;render();break;
    case 'wardrobe-tab':wardrobeTab=value;render();break;
    case 'outfit':if(outfits.includes(value))draftOutfit=value;render();break;
    case 'accessory':if(accessories.includes(value))draftAccessory=value;render();break;
    case 'color':if(colors.some(c=>c.value===value))draftColor=value;render();break;
    case 'rotate-avatar':avatarBack=!avatarBack;render();break;
    case 'save-outfit':state.outfit=draftOutfit;state.color=draftColor;state.accessory=draftAccessory;persist('Look saved. Your profile is up to date.');render();break;
    case 'reset-outfit':draftOutfit=state.outfit;draftColor=state.color;draftAccessory=state.accessory;render();toast('Restored your saved look.');break;
    case 'new-project':projectEditor();break;
    case 'create-server':serverEditor(id);break;
    case 'manage-server':{const server=state.reservedServers.find(server=>server.id===id);if(server)serverEditor(server.gameId,server);break;}
    case 'join-server':{
      const server=[...sampleServers(el.dataset.game),...reservedServerCards(state,el.dataset.game)].find(server=>server.id===id);
      const access=serverAccess(server,state);if(!access.allowed){toast(access.reason);break;}
      previewServerJoin(server);break;
    }
    case 'friend-preview':showFriendPreview(el.closest('[data-friend-preview]'));if(e.detail===0)document.querySelector('#friend-activity-popover a')?.focus();break;
    case 'join-friend':{
      const session=friendSessions.find(session=>session.name===name);
      const server=session?sampleServers(session.gameId).find(server=>server.id===session.serverId):null;
      const access=friendJoinAccess(state,session,server);if(!access.allowed){toast(access.reason);break;}
      closeFriendPreview();previewServerJoin(server,name);break;
    }
    case 'new-group':groupEditor();break;
    case 'manage-group':{const group=state.myGroups.find(group=>group.id===id);if(group)groupEditor(group);break;}
    case 'new-group-game':{const group=findGroup(state,id);if(group?.mine)projectEditor(null,id);break;}
    case 'join-group':case 'leave-group':case 'cancel-group-request':{
      const group=findGroup(state,id), actionName=action==='join-group'?'join':action==='leave-group'?'leave':'cancel';
      if(updateGroupMembership(state,group,actionName)){persist(actionName==='join'?(group.joinPolicy==='approval'?'Preview join request saved.':'You joined the group preview.'):actionName==='leave'?'You left the group preview.':'Preview join request canceled.');render();}break;
    }
    case 'edit-project':case 'project-details':{const project=state.projects.find(p=>p.id===id);if(project)projectEditor(project);break;}
    case 'delete-project':modal('Delete this draft?',`<p class="muted">This removes the draft from this browser.</p>${button('confirm-delete','Delete draft','button danger',`data-id="${esc(id)}"`)} ${button('close-dialog','Keep draft','button')}`);break;
    case 'confirm-delete':state.projects=state.projects.filter(p=>p.id!==id);persist('Draft deleted.');dialog.close();render();break;
    case 'review-pack':{const pack=packs[Number(el.dataset.index)];if(!pack)break;modal('Your Alloy pack',`<div class="checkout-preview">${icon('alloy',48)}<h3>${pack.amount.toLocaleString()} Alloy</h3><strong>${pack.price} USD</strong></div><p class="muted">Illustrative pricing. Checkout is not available. No money will be charged and your sample balance stays the same.</p><button class="button primary full" disabled>Checkout coming soon</button>`);break;}
    case 'friend-tab':setQuery({tab:value==='all'?null:value,person:null});break;
    case 'clear-people':setQuery({person:null});break;
    case 'find-people':navigate('/friends?tab=find');break;
    case 'accept-friend':case 'decline-friend':case 'add-friend':case 'cancel-friend':{
      const transitions={'accept-friend':['accept','Friend request accepted.'],'decline-friend':['decline','Friend request ignored.'],'add-friend':['send','Preview request sent.'],'cancel-friend':['cancel','Request canceled.']};
      const [transition,message]=transitions[action];if(updateFriendship(state,transition,name)){persist(message);render();}break;
    }
    case 'remove-friend':modal('Remove friend?',`<p>Remove ${esc(name)} from your preview friends?</p>${button('confirm-remove','Remove friend','button danger',`data-name="${esc(name)}"`)} ${button('close-dialog','Keep friend','button')}`);break;
    case 'confirm-remove':updateFriendship(state,'remove',name);persist('Friend removed.');dialog.close();render();break;
    case 'reset-demo':modal('Reset this preview?',`<p class="muted">Your favorites, outfits, profile changes, and local drafts will be removed.</p>${button('confirm-reset','Reset preview','button danger')} ${button('close-dialog','Keep my data','button')}`);break;
    case 'confirm-reset':state=loadState({getItem:()=>null});draftOutfit=state.outfit;draftColor=state.color;draftAccessory=state.accessory;settingsDirty=false;persist('Preview reset.');dialog.close();render();break;
  }
});
document.addEventListener('submit',e=>{
  const form=e.target;
  if(!['search-form','landing-search','friend-search','auth-form','project-form','settings-form','asset-form','preference-form','discovery-filter-form','marketplace-search','server-form','group-form','group-search','gift-form','trade-form','report-form'].includes(form.id))return;
  e.preventDefault();if(!form.reportValidity())return;
  const data=new FormData(form);
  if(form.id==='search-form'){closeSuggestions();navigate(routeWithParams('search',new URLSearchParams(),{q:data.get('q').trim()}));}
  if(form.id==='landing-search')navigate(routeWithParams('search',new URLSearchParams(),{q:data.get('q').trim()}));
  if(form.id==='friend-search')setQuery({person:data.get('person').trim()});
  if(form.id==='auth-form'){if(route==='signup')state.profile.name=data.get('username');form.reset();persist('Welcome to the preview. No live account was created.');navigate('/home');}
  if(form.id==='project-form'){
    const name=data.get('name').trim();if(!name){document.querySelector('#project-name').setCustomValidity('Enter a name, not just spaces.');form.reportValidity();return;}
    const id=form.dataset.id;const existing=state.projects.find(p=>p.id===id);
    const project={id:existing?.id||crypto.randomUUID(),name,template:data.get('template'),description:data.get('description').trim(),groupId:state.myGroups.some(group=>group.id===data.get('groupId'))?data.get('groupId'):''};
    if(existing)Object.assign(existing,project);else if(state.projects.length<100)state.projects.push(project);else{toast('The preview supports up to 100 local drafts.');return;}
    persist(existing?'Draft updated.':'Your game draft is ready.');dialog.close();if(project.groupId&&route.startsWith('groups/'))navigate('/groups/'+project.groupId+'?tab=games');else render();
  }
  if(form.id==='settings-form'){
    const section=form.dataset.section;
    if(section==='account'){state.profile.name=data.get('name');state.profile.bio=data.get('bio').trim();for(const key of ['discord','youtube','twitch','tiktok'])state.links[key]=String(data.get(key)||'').trim().slice(0,80);}
    if(section==='privacy'){state.profile.visibility=data.get('visibility');state.friendPolicy=data.get('friendPolicy');state.joinPolicy=data.get('joinPolicy');state.activity=data.has('activity');}
    if(section==='notifications'){state.notifications=data.has('notifications');state.updateNotifications=data.has('updates');}
    if(section==='community')state.links.discord=String(data.get('discord')||'').trim().slice(0,80);
    if(section==='discovery')state.preferredGenres=data.getAll('genres').filter(genre=>genres.includes(genre));
    if(section==='appearance'&&isTheme(data.get('theme')))state.theme=data.get('theme');
    settingsDirty=false;persist('Your settings are saved.');render();
  }
  if(form.id==='preference-form'){state.preferredGenres=data.getAll('genres').filter(genre=>genres.includes(genre));persist('Discovery updated for you.');dialog.close();render();}
  if(form.id==='gift-form'){
    const recipient=form.dataset.name,kind=data.get('kind');
    const result=kind==='item'?giftItem(state,recipient,String(data.get('item')||'')):sendGift(state,recipient,Number(data.get('amount')));
    if(!result.ok){document.querySelector('#gift-error').textContent=result.error;return;}
    persist(kind==='item'?'Accessory sent to '+recipient+' in this preview.':result.gift.amount+' Alloy sent to '+recipient+' in this preview.');
    dialog.close();render();
  }
  if(form.id==='trade-form'){
    const recipient=form.dataset.name;
    const result=proposeTrade(state,recipient,{alloy:Number(data.get('alloy')||0),item:String(data.get('item')||'')});
    if(!result.ok){document.querySelector('#trade-error').textContent=result.error;return;}
    persist('Trade offer saved for '+recipient+'.');
    dialog.close();render();
  }
  if(form.id==='report-form'){
    state.reports+=1;
    persist('Report saved to this preview. Moderation services are not connected.');
    dialog.close();render();
  }
  if(form.id==='discovery-filter-form'){
    const changes=Object.fromEntries(['q','category','mood','mode','rating'].map(key=>[key,data.get(key)==='All'?null:data.get(key)?.trim()||null]));
    changes.unplayed=data.has('unplayed')?'1':null;setQuery(changes);
  }
  if(form.id==='marketplace-search')setQuery({q:data.get('q').trim()||null,type:data.get('type')||null,price:data.get('price')||null,slot:null});
  if(form.id==='asset-form'){
    const name=data.get('name').trim();if(!name){document.querySelector('#asset-name').setCustomValidity('Enter an asset name.');form.reportValidity();return;}
    const existing=state.creatorAssets.find(asset=>asset.id===form.dataset.id);
    const asset={id:existing?.id||crypto.randomUUID(),name,type:form.dataset.type,subcategory:data.get('subcategory'),description:data.get('description').trim(),price:Number(data.get('price')||existing?.price||0),listing:form.dataset.listing==='1'};
    if(existing)Object.assign(existing,asset);else if(state.creatorAssets.length<100)state.creatorAssets.push(asset);else{toast('This preview supports up to 100 asset drafts.');return;}
    persist(asset.listing?'Listing draft saved. It is not published.':'Asset draft saved.');dialog.close();render();
  }
  if(form.id==='server-form'){
    const name=data.get('name').trim(), visibility=data.get('visibility');
    if(!name||name.length>40){document.querySelector('#server-name').setCustomValidity('Enter a name of 1–40 characters.');form.reportValidity();return;}
    const details={gameId:form.dataset.game,name,visibility,invited:data.getAll('invited'),allowFriends:data.has('allowFriends')};
    if(form.dataset.editing==='1'){
      const server=state.reservedServers.find(server=>server.id===form.dataset.id);
      if(!server||!['public','private'].includes(visibility))return;
      Object.assign(server,{name,visibility,invited:visibility==='private'?details.invited.filter(name=>state.friends.includes(name)):[],allowFriends:visibility==='private'&&details.allowFriends});
      persist('Server settings saved. No additional Alloy used.');
    }else{
      const result=createServerPreview(state,details,form.dataset.id);
      if(!result.ok){document.querySelector('#server-form-error').textContent=result.error;return;}
      persist(result.duplicate?'Your reservation already exists.':'Server preview created. '+SERVER_PRICE+' demo Alloy used.');
    }
    dialog.close();render();
  }
  if(form.id==='group-search')setQuery({q:data.get('q').trim()||null,category:data.get('category')==='All'?null:data.get('category')});
  if(form.id==='group-form'){
    const name=data.get('name').trim();if(name.length<3){document.querySelector('#group-name').setCustomValidity('Enter a group name of at least 3 characters.');form.reportValidity();return;}
    const existing=state.myGroups.find(group=>group.id===form.dataset.id);
    if(!existing&&state.myGroups.length>=30){toast('The preview supports up to 30 groups.');return;}
    const group={id:existing?.id||crypto.randomUUID(),name,description:data.get('description').trim(),category:data.get('category'),joinPolicy:data.get('joinPolicy')};
    if(existing)Object.assign(existing,group);else state.myGroups.push(group);
    persist(existing?'Your group is updated.':'Your group preview is ready.');dialog.close();navigate('/groups/'+group.id);
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='site-search')suggestSearch(e.target.value);
  if(['project-name','asset-name','server-name','group-name'].includes(e.target.id))e.target.setCustomValidity('');
  if(e.target.closest('#settings-form')){settingsDirty=true;document.querySelector('.settings-save .muted').textContent='Unsaved changes';}
});
document.addEventListener('change',e=>{
  if(e.target.id==='sort')setQuery({sort:e.target.value==='recommended'?null:e.target.value});
  if(e.target.id==='server-sort')setQuery({serverSort:e.target.value==='available'?null:e.target.value});
  if(e.target.closest('#server-form')&&e.target.name==='visibility')document.querySelector('.private-access-options').hidden=e.target.value==='public';
  if(e.target.closest('#settings-form')){settingsDirty=true;document.querySelector('.settings-save .muted').textContent='Unsaved changes';}
});
document.addEventListener('pointerover',e=>{const trigger=e.target.closest('[data-friend-preview]');if(trigger)showFriendPreview(trigger);else if(e.target.closest('#friend-activity-popover'))clearTimeout(friendCloseTimer);});
document.addEventListener('pointerout',e=>{if(e.target.closest('[data-friend-preview],#friend-activity-popover'))scheduleFriendClose(e.relatedTarget);});
document.addEventListener('focusout',e=>{if(e.target.closest('[data-friend-preview],#friend-activity-popover'))scheduleFriendClose(e.relatedTarget);});
document.addEventListener('focusin',e=>{const trigger=e.target.closest('[data-friend-preview]');if(trigger)showFriendPreview(trigger);else if(e.target.closest('#friend-activity-popover'))clearTimeout(friendCloseTimer);else closeFriendPreview();if(e.target.id==='site-search')suggestSearch(e.target.value);if(!e.target.closest('#search-form'))closeSuggestions();if(notificationsOpen&&!e.target.closest('#notification-popover,#notification-toggle'))updateNotificationPopover(false);});
document.addEventListener('keydown',e=>{
  const inField=e.target.matches('input,textarea,select')||e.target.isContentEditable;
  if(e.key==='/'&&!inField&&!dialog.open){const search=document.querySelector('#site-search');if(search){e.preventDefault();search.focus();}}
  if(e.key==='ArrowDown'&&e.target.closest('[data-friend-preview]')){e.preventDefault();showFriendPreview(e.target.closest('[data-friend-preview]'));document.querySelector('#friend-activity-popover a')?.focus();}
  if(e.key==='Tab'&&!e.shiftKey&&e.target.classList.contains('activity-trigger')&&activeFriendTrigger){e.preventDefault();document.querySelector('#friend-activity-popover a')?.focus();}
  if(e.key==='Escape'){const trigger=activeFriendTrigger?.querySelector('.activity-trigger');closeFriendPreview();trigger?.focus();closeFriendPreview();closeSuggestions();if(notificationsOpen){updateNotificationPopover(false);document.querySelector('#notification-toggle')?.focus();}if(document.body.classList.contains('nav-open'))setMenu(false);}
  if(e.key==='ArrowDown'&&e.target.id==='site-search'){const first=document.querySelector('#search-suggestions:not([hidden]) a');if(first){e.preventDefault();first.focus();}}
  if(e.target.closest('#search-suggestions')&&['ArrowDown','ArrowUp'].includes(e.key)){
    const links=[...document.querySelectorAll('#search-suggestions a')], index=links.indexOf(e.target);
    e.preventDefault();if(e.key==='ArrowUp'&&index===0)document.querySelector('#site-search').focus();else links[(index+(e.key==='ArrowDown'?1:-1)+links.length)%links.length].focus();
  }
  if(e.key==='Tab'&&document.body.classList.contains('nav-open')){
    const links=[...document.querySelectorAll('#sidebar a')],first=links[0],last=links.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
document.addEventListener('scroll',e=>{if(!e.target.closest?.('#friend-activity-popover'))closeFriendPreview();if(e.target.classList?.contains('card-scroller'))updateShelfControls();},true);
window.addEventListener('resize',()=>{closeFriendPreview();if(innerWidth>820&&document.body.classList.contains('nav-open'))setMenu(false);updateShelfControls();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
render();

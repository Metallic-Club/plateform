import { escapeHtml as esc } from './store.js';
export function portrait(state, cls = '', label = 'Your saved avatar') {
  const hair = state.outfit === 'Explorer' ? '#787453' : state.outfit === 'Streetwear' ? '#4c354f' : '#26313c';
  return `<svg class="avatar ${esc(cls)}" viewBox="0 0 100 100" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
    <rect width="100" height="100" fill="#657a91"/><circle cx="83" cy="17" r="25" fill="#fff" opacity=".1"/>
    <path d="M8 104V81q0-18 22-22l20-4 20 4q22 4 22 22v23" fill="${esc(state.color)}"/>
    <path d="M39 56h22v14l-11 8-11-8z" fill="#deb083"/>
    <rect x="27" y="25" width="46" height="40" rx="10" fill="#deb083"/>
    <path d="M26 33V25q0-15 24-15t24 17v6l-13-9z" fill="${hair}"/>
    <path d="M38 45v2m24-2v2" stroke="#26292d" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M44 56q6 5 12 0" stroke="#804b35" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${state.outfit === 'Explorer' ? '<path d="M28 68v32m44-32v32" stroke="#b2a383" stroke-width="10"/>' : ''}
    ${state.accessory === 'Cap' ? '<path d="M23 30q0-24 27-24t27 24z" fill="#293549"/><rect x="17" y="26" width="64" height="7" rx="3" fill="#424e65"/>' : ''}
    ${state.accessory === 'Headphones' ? '<path d="M22 44V30a28 28 0 0 1 56 0v14" fill="none" stroke="#252a34" stroke-width="7"/><rect x="18" y="34" width="10" height="23" rx="4" fill="#b2bdd0"/><rect x="72" y="34" width="10" height="23" rx="4" fill="#b2bdd0"/>' : ''}
  </svg>`;
}
export const community = [
  { name: 'heroX_x', avatar: 1, activity: 'Playing Cyber Raven', game: '1', bio: 'Always up for one more adventure.' },
  { name: 'CRIMSONSLAYER', avatar: 2, activity: 'Playing Cyber Raven', game: '1', bio: 'Exploring worlds and chasing high scores.' },
  { name: '00RIP_INDRA', avatar: 3, activity: 'Playing Rift Hunters', game: '3', bio: 'New worlds. New challenges.' },
  { name: 'PixelNova', avatar: 1, activity: 'Offline', bio: 'Making small worlds with big ideas.' },
  { name: 'CloudBuilder', avatar: 2, activity: 'Using Studio', bio: 'Building something new every day.' },
  { name: 'LunaBlocks', avatar: 3, activity: 'Online', bio: 'Here for the adventures and the people.' },
  { name: 'NeonFox', avatar: 1, activity: 'Offline', bio: 'Racing into the next chapter.' },
  { name: 'OrbitKai', avatar: 2, activity: 'Online', bio: 'See you among the stars.' },
];
export const personInfo = name => community.find(p => p.name === name) || { name, avatar: 1, activity: 'Offline', bio: 'A member of the preview community.' };

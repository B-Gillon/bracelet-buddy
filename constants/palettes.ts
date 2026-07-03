export interface PresetPalette {
  id: string;
  name: string;
  colors: string[];
}

export const PRESET_PALETTES: PresetPalette[] = [
  { id: 'beach', name: 'Beach', colors: ['#E6D5B8', '#98D7C2', '#167D7F', '#FFF1C5', '#A28A67'] },
  { id: 'reggae', name: 'Reggae', colors: ['#E52B2D', '#F8C300', '#008751', '#1A1A1A'] },
  { id: 'metal', name: 'Metal', colors: ['#121212', '#4A4A4A', '#C0C0C0', '#A3E722', '#660000'] },
  { id: 'seventies', name: '70s Sunset', colors: ['#E39B00', '#C85A17', '#912F1F', '#606C38', '#FEFAE0'] },
  { id: 'cyberpunk', name: 'Cyberpunk', colors: ['#FF007F', '#00F5FF', '#9B00FF', '#0B0C10'] },
  { id: 'cottagecore', name: 'Cottagecore', colors: ['#4A5D4E', '#8FA88B', '#D0C9BC', '#704F38', '#8C4F6E'] },
  { id: 'bubblegum', name: 'Bubblegum', colors: ['#FFC6FF', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF'] },
  { id: 'sunset', name: 'Sunset', colors: ['#ff6b6b', '#feca57', '#ff9ff3', '#ee5a24', '#9b59b6'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0077b6', '#00b4d8', '#90e0ef', '#caf0f8', '#03045e'] },
  { id: 'forest', name: 'Forest', colors: ['#1b4332', '#40916c', '#74c69d', '#d8f3dc', '#8d6e63'] },
  { id: 'candy', name: 'Candy', colors: ['#ff85a1', '#ffa9e7', '#c77dff', '#48cae4', '#f9c74f'] },
  { id: 'earth', name: 'Earth', colors: ['#6b4226', '#c8a96e', '#d4a574', '#8fbc8f', '#556b2f'] },
  { id: 'galaxy', name: 'Galaxy', colors: ['#0d0221', '#4a00e0', '#8e2de2', '#00c6ff', '#f7971e'] },
];
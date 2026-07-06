export interface AvatarOption {
  id: string;
  label: string;
  source: any;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'purple', label: 'Purple', source: require('../assets/avatars/bead-purple.png') },
  { id: 'teal',   label: 'Teal',   source: require('../assets/avatars/bead-teal.png') },
  { id: 'coral',  label: 'Coral',  source: require('../assets/avatars/bead-coral.png') },
  { id: 'pink',   label: 'Pink',   source: require('../assets/avatars/bead-pink.png') },
];

export const DEFAULT_AVATAR_ID = 'purple';

export function getAvatarSource(avatarId: string | null | undefined) {
  const found = AVATAR_OPTIONS.find(a => a.id === avatarId);
  return (found ?? AVATAR_OPTIONS[0]).source;
}

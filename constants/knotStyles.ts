export interface KnotStyle {
  id: string;
  name: string;
  kidDescription: string;
}

export const KNOT_STYLES: KnotStyle[] = [
  {
    id: 'F',
    name: 'Forward Knot (F)',
    kidDescription: 'The most basic knot! Your working thread travels from left to right across the bracelet.',
  },
  {
    id: 'B',
    name: 'Backward Knot (B)',
    kidDescription: 'Just like the forward knot but in reverse — your thread travels from right to left.',
  },
  {
    id: 'FB',
    name: 'Forward-Backward Knot (FB)',
    kidDescription: 'Your thread makes a knot and stays in place — great for making V shapes and diamonds.',
  },
  {
    id: 'BF',
    name: 'Backward-Forward Knot (BF)',
    kidDescription: 'The mirror of FB — your thread stays put again, perfect for symmetrical patterns.',
  },
];

export interface PatternStyle {
  id: string;
  name: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
}

export const PATTERN_STYLES: PatternStyle[] = [
  { id: 'candy-stripe',     name: 'Candy Stripe',      difficulty: 'Beginner',     description: 'Diagonal stripes using only forward knots.' },
  { id: 'chevron',          name: 'Chevron',            difficulty: 'Beginner',     description: 'Classic V-shape pattern meeting in the center.' },
  { id: 'spiral',           name: 'Spiral Staircase',   difficulty: 'Beginner',     description: 'One color spirals around the others.' },
  { id: 'double-chain',     name: 'Double Chain',       difficulty: 'Beginner',     description: 'The simplest pattern — only two strings needed.' },
  { id: 'diamond',          name: 'Diamond',            difficulty: 'Intermediate', description: 'Repeating diamond shapes using all four knot types.' },
  { id: 'fishtail',         name: 'Fishtail',           difficulty: 'Intermediate', description: 'Braid-like design that resembles a fish tail.' },
  { id: 'chinese-ladder',   name: 'Chinese Ladder',     difficulty: 'Intermediate', description: 'A core cord wrapped by alternating floss strands.' },
  { id: 'alpha',            name: 'Alpha / Letters',    difficulty: 'Intermediate', description: 'Knot letters and symbols into your bracelet.' },
];

export interface StringThickness {
  id: string;
  name: string;
  description: string;
  mmDiameter: number;
}

export const STRING_THICKNESSES: StringThickness[] = [
  { id: 'embroidery-floss', name: 'Embroidery Floss',      description: 'Standard choice. Smooth and easy to knot.', mmDiameter: 1 },
  { id: 'thin-yarn',        name: 'Thin Yarn',             description: 'Slightly chunkier. Good for beginners.',    mmDiameter: 1.5 },
  { id: 'hemp-1mm',         name: 'Hemp Cord (1mm)',        description: 'Natural, earthy look. Holds knots firmly.', mmDiameter: 1 },
  { id: 'hemp-15mm',        name: 'Hemp Cord (1.5mm)',      description: 'Thicker hemp for chunkier bracelets.',      mmDiameter: 1.5 },
  { id: 'paracord',         name: 'Paracord (Micro)',       description: 'Durable and sporty. Thicker bracelets.',    mmDiameter: 2 },
  { id: 'satin-rattail',    name: 'Satin / Rattail Cord',  description: 'Smooth and shiny. Polished, elegant look.', mmDiameter: 1.5 },
];
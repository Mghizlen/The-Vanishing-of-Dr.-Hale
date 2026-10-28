export type Hotspot = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  objectId?: string;
  itemId?: string;
  puzzleId?: string;
};

export type PuzzleDefinition = {
  id: string;
  title: string;
  prompt: string;
  options: string[];
  stage: number;
  rewardItem?: string;
};

export const CONTENT_OBJECT_IDS = new Set([
  "obj_desk_calendar", "obj_drawer", "obj_torn_letter", "obj_wall_portrait",
  "obj_bookshelf", "obj_globe", "obj_reading_lamp", "obj_telescope",
  "obj_star_chart", "obj_brass_dial", "obj_crates", "obj_wine_rack",
  "obj_locked_chest", "obj_weather_vane", "obj_footprints", "obj_final_board",
]);

export const CONTENT_ITEM_IDS = new Set([
  "item_brass_key", "item_letter_full", "item_observatory_pass", "item_lens",
  "item_cellar_map", "item_journal",
]);

export const CONTENT_PUZZLE_IDS: readonly PuzzleDefinition[] = [
  { id: "puz_drawer_code", title: "The Calendar Code", prompt: "Which three digits open the drawer?", options: ["184", "314", "621", "907"], stage: 1, rewardItem: "item_brass_key" },
  { id: "puz_torn_letter", title: "The Torn Letter", prompt: "Which phrase completes the letter?", options: ["Meet me beneath the stars.", "Leave before dawn.", "The key is lost.", "Trust no one."], stage: 1, rewardItem: "item_letter_full" },
  { id: "puz_books", title: "The Bookshelf", prompt: "Which order follows the spine colours?", options: ["Blue, red, green", "Red, green, blue", "Green, blue, red", "Blue, green, red"], stage: 2, rewardItem: "item_observatory_pass" },
  { id: "puz_stars", title: "The Star Dial", prompt: "Which constellation aligns with the date?", options: ["Orion", "Lyra", "Cygnus", "Draco"], stage: 3, rewardItem: "item_lens" },
  { id: "puz_cipher", title: "The Chest Cipher", prompt: "What does the cipher reveal?", options: ["HIDE", "NORTH", "MOON", "HALL"], stage: 4, rewardItem: "item_journal" },
  { id: "puz_accusation", title: "The Final Accusation", prompt: "Who moved Dr. Hale?", options: ["The curator", "The groundskeeper", "The assistant", "No one"], stage: 5 },
];

export const HOTSPOTS: Record<number, readonly Hotspot[]> = {
  1: [
    { id: "hot_calendar", label: "Inspect desk calendar", x: 8, y: 58, width: 18, height: 24, objectId: "obj_desk_calendar", puzzleId: "puz_drawer_code" },
    { id: "hot_drawer", label: "Inspect drawer", x: 28, y: 63, width: 18, height: 18, objectId: "obj_drawer", puzzleId: "puz_drawer_code" },
    { id: "hot_letter", label: "Inspect torn letter", x: 54, y: 65, width: 16, height: 15, objectId: "obj_torn_letter", puzzleId: "puz_torn_letter" },
    { id: "hot_portrait", label: "Inspect wall portrait", x: 73, y: 12, width: 17, height: 35, objectId: "obj_wall_portrait" },
  ],
  2: [{ id: "hot_books", label: "Inspect bookshelf", x: 10, y: 20, width: 35, height: 65, objectId: "obj_bookshelf", puzzleId: "puz_books" }, { id: "hot_globe", label: "Inspect globe", x: 55, y: 56, width: 18, height: 25, objectId: "obj_globe" }],
  3: [{ id: "hot_telescope", label: "Inspect telescope", x: 12, y: 42, width: 38, height: 35, objectId: "obj_telescope", puzzleId: "puz_stars" }, { id: "hot_chart", label: "Inspect star chart", x: 62, y: 15, width: 25, height: 30, objectId: "obj_star_chart" }],
  4: [{ id: "hot_chest", label: "Inspect locked chest", x: 55, y: 58, width: 28, height: 25, objectId: "obj_locked_chest", puzzleId: "puz_cipher" }, { id: "hot_crates", label: "Inspect crates", x: 8, y: 58, width: 30, height: 28, objectId: "obj_crates" }],
  5: [{ id: "hot_board", label: "Inspect final board", x: 22, y: 14, width: 56, height: 55, objectId: "obj_final_board", puzzleId: "puz_accusation" }, { id: "hot_footprints", label: "Inspect footprints", x: 8, y: 75, width: 26, height: 15, objectId: "obj_footprints" }],
};

export function puzzleById(id: string): PuzzleDefinition | undefined {
  return CONTENT_PUZZLE_IDS.find((puzzle) => puzzle.id === id);
}

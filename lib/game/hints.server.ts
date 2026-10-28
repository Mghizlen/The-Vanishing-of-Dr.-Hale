import "server-only";

import { puzzleById } from "@/lib/game/content-config";

const HINTS: Record<string, string> = {
  puz_drawer_code: "The circled dates point to the digits of pi.",
  puz_torn_letter: "The portrait faces the observatory.",
  puz_books: "Read the letter's coloured marks left to right.",
  puz_stars: "The letter marks the winter date.",
  puz_cipher: "The portrait frame hides the key word.",
  puz_accusation: "The journal names the only person with a key.",
};

export function hintForPuzzle(id: string): string {
  return puzzleById(id) ? HINTS[id] ?? "Inspect the scene carefully and follow the evidence." : "Inspect the scene carefully and follow the evidence.";
}

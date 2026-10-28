import "server-only";

const SOLUTIONS: Record<string, string> = {
  puz_drawer_code: "314",
  puz_torn_letter: "Meet me beneath the stars.",
  puz_books: "Red, green, blue",
  puz_stars: "Orion",
  puz_cipher: "NORTH",
  puz_accusation: "The assistant",
};

export function isPuzzleSolution(id: string, answer: string): boolean {
  return SOLUTIONS[id] === answer;
}

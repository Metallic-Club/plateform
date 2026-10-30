import type { StudioTemplate } from "../../types";

export const templates: StudioTemplate[] = [
  {
    id: "t-baseplate",
    name: "Empty baseplate",
    summary: "A flat floor, a spawn point and default lighting. Nothing else to delete.",
    includes: ["Spawn point", "Day lighting", "Third-person camera"],
    art: { scene: "blocks", palette: ["#d7d9de", "#bfc2c9", "#9a9ea8", "#6d717b", "#5d49d8"], seed: 5 },
  },
  {
    id: "t-obstacle",
    name: "Obstacle course",
    summary: "Checkpoints, moving platforms and a finish line wired to a leaderboard.",
    includes: ["Checkpoints", "Moving platforms", "Timer and leaderboard"],
    art: { scene: "platforms", palette: ["#2e3346", "#474e6b", "#d9d4c4", "#8a5a9e", "#efe6cc"], seed: 9 },
  },
  {
    id: "t-racing",
    name: "Racing circuit",
    summary: "A closed track with lap counting, a starting grid and a drivable car.",
    includes: ["Vehicle controller", "Lap counter", "Starting grid"],
    art: { scene: "track", palette: ["#b9c4b0", "#7f8f72", "#4c4f52", "#2c2e30", "#e9d36a"], seed: 13 },
  },
  {
    id: "t-tycoon",
    name: "Tycoon starter",
    summary: "Plots, a currency, a first machine and a save system that keeps progress.",
    includes: ["Player plots", "Currency and shop", "Saved progress"],
    art: { scene: "blocks", palette: ["#e4dccb", "#c8b48e", "#6e8aa6", "#3e4a5c", "#d76d4c"], seed: 17 },
  },
  {
    id: "t-arena",
    name: "Team arena",
    summary: "Two teams, rounds, respawns and a small symmetrical map to change.",
    includes: ["Teams and rounds", "Respawns", "Scoreboard"],
    art: { scene: "arena", palette: ["#3b3a44", "#55535f", "#7a7887", "#24232a", "#d9dbe2"], seed: 21 },
  },
  {
    id: "t-escape",
    name: "Escape room",
    summary: "Linked rooms, doors that open on puzzle triggers and a hint system.",
    includes: ["Trigger doors", "Puzzle state", "Hints"],
    art: { scene: "rooms", palette: ["#d6d1c6", "#ada699", "#7a7468", "#3a3732", "#b0573f"], seed: 25 },
  },
];

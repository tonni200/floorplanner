import type { GroupedKit, LibraryCategory, LibraryItem } from "./catalogTypes";

const item = (
  id: string,
  name: string,
  category: LibraryCategory,
  width: number,
  height: number,
  visualWeight: "weak" | "normal" | "strong",
): LibraryItem => ({
  id,
  name,
  category,
  widthCm: width,
  heightCm: height,
  visualWeight,
});

export const elementCatalog: LibraryItem[] = [
  item("bed-double", "double bed", "bedroom", 160, 210, "strong"),
  item("bedside-table", "bedside table", "bedroom", 45, 45, "normal"),
  item("sofa-3", "3 seat sofa", "living_room", 230, 95, "strong"),
  item("coffee-table-rect", "coffee table rectangle", "living_room", 120, 60, "normal"),
  item("dining-table-6", "dining table 6", "dining", 180, 95, "strong"),
  item("kitchen-l", "L kitchen", "kitchen", 300, 300, "strong"),
  item("toilet", "toilet", "bathroom", 40, 75, "strong"),
  item("shower-square", "shower square", "bathroom", 90, 90, "strong"),
  item("pool-table", "pool table", "activity_room", 260, 140, "strong"),
  item("indoor-pool-small", "indoor pool small", "pool_and_wellness", 400, 240, "strong"),
  item("terrace-zone", "terrace zone", "outdoor", 500, 350, "normal"),
  item("staircase-straight", "staircase straight", "building_and_structure", 110, 360, "strong"),
  item("note-marker", "note marker", "presentation_helpers", 40, 40, "weak"),
];

export const groupedKits: GroupedKit[] = [
  {
    id: "bedroom-kit",
    name: "bedroom kit",
    itemIds: ["bed-double", "bedside-table"],
  },
  {
    id: "living-room-kit",
    name: "living room kit",
    itemIds: ["sofa-3", "coffee-table-rect"],
  },
  {
    id: "dining-kit",
    name: "dining kit",
    itemIds: ["dining-table-6"],
  },
];

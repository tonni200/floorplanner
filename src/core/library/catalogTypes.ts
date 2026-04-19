export type LibraryCategory =
  | "bedroom"
  | "living_room"
  | "dining"
  | "kitchen"
  | "bathroom"
  | "activity_room"
  | "pool_and_wellness"
  | "outdoor"
  | "building_and_structure"
  | "presentation_helpers";

export interface LibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  widthCm: number;
  heightCm: number;
  visualWeight: "weak" | "normal" | "strong";
}

export interface GroupedKit {
  id: string;
  name: string;
  itemIds: string[];
}

export interface LibraryCatalog {
  items: LibraryItem[];
  groupedKits: GroupedKit[];
}

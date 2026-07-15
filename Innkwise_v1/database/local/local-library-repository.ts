import crypto from "crypto";
import fs from "fs";
import path from "path";

export type LocalLibraryItem = {
  id: string;
  userId: string;
  kind: string;
  name: string;
  url?: string | null;
  mimeType?: string | null;
  size?: number | null;
  contentBase64?: string | null;
  isFavorite?: boolean;
  createdAt: string;
};

const libraryItemsPath = path.join(process.cwd(), "data", "library-items.json");

function ensureLibraryItemsFile() {
  fs.mkdirSync(path.dirname(libraryItemsPath), { recursive: true });
  if (!fs.existsSync(libraryItemsPath)) {
    fs.writeFileSync(libraryItemsPath, "[]");
  }
}

function readLibraryItems(): LocalLibraryItem[] {
  ensureLibraryItemsFile();
  const raw = fs.readFileSync(libraryItemsPath, "utf-8");
  return JSON.parse(raw) as LocalLibraryItem[];
}

function writeLibraryItems(items: LocalLibraryItem[]) {
  ensureLibraryItemsFile();
  fs.writeFileSync(libraryItemsPath, JSON.stringify(items, null, 2));
}

export function listLocalLibraryItems(userId: string) {
  return readLibraryItems()
    .filter((item) => item.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200);
}

export function createLocalLibraryItem(input: Omit<LocalLibraryItem, "id" | "createdAt">) {
  const items = readLibraryItems();
  const item: LocalLibraryItem = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: new Date().toISOString()
  };

  items.push(item);
  writeLibraryItems(items);
  return item;
}

export function updateLocalLibraryItem(userId: string, id: string, data: Partial<Pick<LocalLibraryItem, "isFavorite">>) {
  const items = readLibraryItems();
  const nextItems = items.map((item) =>
    item.userId === userId && item.id === id ? { ...item, ...data } : item
  );
  writeLibraryItems(nextItems);
  return nextItems.find((item) => item.userId === userId && item.id === id) ?? null;
}

export function deleteLocalLibraryItems(userId: string, ids: string[]) {
  const items = readLibraryItems();
  writeLibraryItems(items.filter((item) => item.userId !== userId || !ids.includes(item.id)));
}

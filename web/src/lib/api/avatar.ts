import { WARDROBE_CATEGORIES, type Avatar, type AvatarLook, type CatalogItemSummary, type WardrobeCategory } from "./types";

export function isWardrobeCategory(c: string): c is WardrobeCategory {
  return (WARDROBE_CATEGORIES as readonly string[]).includes(c);
}

/** Turns the spec's Avatar into what the avatar renderer draws. Items without art are skipped. */
export function lookFromAvatar(avatar: Avatar): AvatarLook {
  const equipped: AvatarLook["equipped"] = {};
  for (const item of avatar.equipped) {
    if (item.art && isWardrobeCategory(item.category)) equipped[item.category] = { ...item.art, itemId: item.id };
  }
  return { skin: avatar.bodyColors.head, equipped };
}

/** The body of PUT /v1/me/avatar for a look. */
export function avatarUpdate(look: AvatarLook) {
  const c = look.skin;
  return {
    bodyColors: { head: c, torso: c, arms: c, legs: c },
    equippedItemIds: Object.values(look.equipped).map((e) => e.itemId),
  };
}

/** Items the renderer can draw, for the Wardrobe closet. */
export function drawable(items: CatalogItemSummary[]) {
  return items.filter((i): i is CatalogItemSummary & { art: NonNullable<CatalogItemSummary["art"]> } => Boolean(i.art));
}

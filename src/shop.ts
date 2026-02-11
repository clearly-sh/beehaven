// ============================================================================
// BeeHaven Office - Shop System
// Honey currency, cosmetic catalog, purchase/equip logic
// ============================================================================

import type { HookEventName, ShopItem, ShopState, ShopPersistData } from './types.js';

// ---- Honey Earning Table ----
export const HONEY_REWARDS: Partial<Record<HookEventName, number>> = {
  SessionStart:      5,
  UserPromptSubmit:  2,
  PreToolUse:        1,
  PostToolUse:       1,
  SubagentStart:     3,
  Stop:              5,
  SessionEnd:       10,
};

// ---- Shop Catalog ----
export const SHOP_ITEMS: ShopItem[] = [
  // Skins (change queen bee body color)
  { id: 'default',   name: 'Honey Gold',        type: 'skin', price: 0,   color: '#F59E0B', description: 'The classic golden bee' },
  { id: 'midnight',  name: 'Midnight Hacker',    type: 'skin', price: 50,  color: '#1E293B', description: 'Dark as a terminal at 3am' },
  { id: 'ocean',     name: 'Ocean Breeze',       type: 'skin', price: 50,  color: '#0EA5E9', description: 'Cool blue coastal vibes' },
  { id: 'cherry',    name: 'Cherry Blossom',     type: 'skin', price: 75,  color: '#EC4899', description: 'Soft pink spring bloom' },
  { id: 'emerald',   name: 'Emerald Coder',      type: 'skin', price: 75,  color: '#10B981', description: 'Green like passing tests' },
  { id: 'royal',     name: 'Royal Purple',        type: 'skin', price: 100, color: '#8B5CF6', description: 'Regal and distinguished' },
  { id: 'sunset',    name: 'Sunset Fire',         type: 'skin', price: 150, color: '#F97316', description: 'Warm orange glow' },
  { id: 'cosmic',    name: 'Cosmic Nebula',       type: 'skin', price: 300, color: '#6366F1', description: 'Deep space indigo' },
  { id: 'legendary', name: 'Legendary Aureate',   type: 'skin', price: 500, color: '#EAB308', description: 'Shimmering legendary gold' },

  // Accessories (visual additions to queen bee)
  { id: 'party-hat',   name: 'Party Hat',    type: 'accessory', price: 15,  description: 'Celebrate every deploy' },
  { id: 'bow-tie',     name: 'Bow Tie',      type: 'accessory', price: 20,  description: 'Dapper and professional' },
  { id: 'sunglasses',  name: 'Cool Shades',  type: 'accessory', price: 25,  description: 'Too cool for bugs' },
  { id: 'top-hat',     name: 'Top Hat',      type: 'accessory', price: 30,  description: 'Sophisticated engineering' },
  { id: 'headphones',  name: 'DJ Beats',     type: 'accessory', price: 40,  description: 'In the zone' },
  { id: 'wizard-hat',  name: 'Wizard Hat',   type: 'accessory', price: 75,  description: 'Code is magic' },
  { id: 'halo',        name: 'Angel Halo',   type: 'accessory', price: 100, description: 'Blessed by clean code' },
  { id: 'devil-horns', name: 'Devil Horns',  type: 'accessory', price: 100, description: 'Debugging with attitude' },
];

/** Create a fresh default shop state */
export function createDefaultShopState(): ShopState {
  return {
    honey: 0,
    ownedSkins: ['default'],
    ownedAccessories: [],
    equippedSkin: 'default',
    equippedAccessory: null,
    items: SHOP_ITEMS,
  };
}

/** Restore shop state from persisted config data */
export function loadShopState(data?: ShopPersistData): ShopState {
  const defaults = createDefaultShopState();
  if (!data) return defaults;

  return {
    honey: data.honey ?? 0,
    ownedSkins: data.ownedSkins?.length ? data.ownedSkins : ['default'],
    ownedAccessories: data.ownedAccessories ?? [],
    equippedSkin: data.equippedSkin ?? 'default',
    equippedAccessory: data.equippedAccessory ?? null,
    items: SHOP_ITEMS,
  };
}

/** Extract persist-safe data (no catalog) */
export function getShopPersistData(shop: ShopState): ShopPersistData {
  return {
    honey: shop.honey,
    ownedSkins: shop.ownedSkins,
    ownedAccessories: shop.ownedAccessories,
    equippedSkin: shop.equippedSkin,
    equippedAccessory: shop.equippedAccessory,
  };
}

/** Purchase an item. Returns error string or null on success. */
export function purchaseItem(shop: ShopState, itemId: string): string | null {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return 'Item not found';

  // Check already owned
  if (item.type === 'skin' && shop.ownedSkins.includes(itemId)) return 'Already owned';
  if (item.type === 'accessory' && shop.ownedAccessories.includes(itemId)) return 'Already owned';

  // Check balance
  if (shop.honey < item.price) return 'Not enough honey';

  // Deduct and add
  shop.honey -= item.price;
  if (item.type === 'skin') {
    shop.ownedSkins.push(itemId);
  } else {
    shop.ownedAccessories.push(itemId);
  }

  return null;
}

/** Equip an owned item. Returns error string or null on success. */
export function equipItem(shop: ShopState, itemId: string): string | null {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return 'Item not found';

  if (item.type === 'skin') {
    if (!shop.ownedSkins.includes(itemId)) return 'Not owned';
    shop.equippedSkin = itemId;
  } else {
    // Toggle: equip if different, unequip if same
    if (!shop.ownedAccessories.includes(itemId)) return 'Not owned';
    shop.equippedAccessory = shop.equippedAccessory === itemId ? null : itemId;
  }

  return null;
}

/** Get the color hex for the equipped skin */
export function getEquippedSkinColor(shop: ShopState): string {
  const skin = SHOP_ITEMS.find(i => i.id === shop.equippedSkin && i.type === 'skin');
  return skin?.color || '#F59E0B';
}

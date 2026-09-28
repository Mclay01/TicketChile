export const mediaPurposes = ['POSTER', 'HERO_DESKTOP', 'HERO_MOBILE'] as const;
export type MediaPurpose = typeof mediaPurposes[number];
export const mediaSlots = { image: 'POSTER', hero_desktop: 'HERO_DESKTOP', hero_mobile: 'HERO_MOBILE' } as const;
export const validMediaKey = (key: string) => /^[a-f0-9-]{36}\.webp$/.test(key) || /^(local|development|preview|production)\/v1\/[a-f0-9]{24}\/[a-f0-9]{24}\/(POSTER|HERO_DESKTOP|HERO_MOBILE)\/[a-f0-9-]{36}\/(hero|card|thumb)\.webp$/.test(key);

/**
 * Public HTTPS images for seed products.
 * Relative `/uploads/seed/*` only works when those files exist on the API host;
 * local FE often talks to the remote API, so seed media must be publicly reachable.
 */
export const SEED_PRODUCT_IMAGES = {
  'cement-banner.jpg':
    'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
  'cement-1.jpg':
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
  'mortar-banner.jpg':
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
  'factory-cement.jpg':
    'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
  'mkt-1.jpg':
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
  'mkt-2.jpg':
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80',
  'mkt-3.jpg':
    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=800&q=80',
  'mkt-4.jpg':
    'https://images.unsplash.com/photo-1590086782792-42dd19cc7346?auto=format&fit=crop&w=800&q=80',
  'mkt-5.jpg':
    'https://images.unsplash.com/photo-1600585154340-0ef3c08caaed?auto=format&fit=crop&w=800&q=80',
  'mkt-6.jpg':
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
  'mkt-7.jpg':
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80',
  'mkt-8.jpg':
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80',
  'mkt-9.jpg':
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
  'mkt-10.jpg':
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
  'mkt-11.jpg':
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80',
  'mkt-12.jpg':
    'https://images.unsplash.com/photo-1448630360428-65456885c650?auto=format&fit=crop&w=800&q=80',
  'mkt-13.jpg':
    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=80',
  'mkt-14.jpg':
    'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80',
  'mkt-15.jpg':
    'https://images.unsplash.com/photo-1429497419816-9ca5cfb4571a?auto=format&fit=crop&w=800&q=80',
  'mkt-16.jpg':
    'https://images.unsplash.com/photo-1590644365607-1c5a1b5772e3?auto=format&fit=crop&w=800&q=80',
}

export function seedImageUrl(fileName) {
  const key = String(fileName || '')
    .replace(/^.*\//, '')
    .trim()
  return (
    SEED_PRODUCT_IMAGES[key] ||
    SEED_PRODUCT_IMAGES['cement-banner.jpg']
  )
}

/** Map legacy `/uploads/seed/foo.jpg` (or bare filename) → public URL. */
export function resolveSeedMediaUrl(pathOrUrl) {
  if (!pathOrUrl) return seedImageUrl('cement-banner.jpg')
  const value = String(pathOrUrl)
  if (/^https?:\/\//i.test(value) && !/\/uploads\/seed\//i.test(value)) {
    return value
  }
  const match = value.match(/([^/]+\.(jpe?g|png|webp))$/i)
  return seedImageUrl(match?.[1] || 'cement-banner.jpg')
}

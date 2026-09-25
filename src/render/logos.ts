/** Chargement paresseux et mis en cache des écussons (public/logos/&lt;id&gt;.png). */
const cache = new Map<string, HTMLImageElement>();

export function obtientLogo(id: string): HTMLImageElement | null {
  if (!id) return null;
  const existant = cache.get(id);
  if (existant) return existant.complete ? existant : null;
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}logos/${id}.png`;
  cache.set(id, img);
  return null;
}

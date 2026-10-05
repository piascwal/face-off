/** Partage le lien d'un salon (feuille de partage du téléphone si elle existe, sinon presse-papiers). Renvoie vrai si c'est fait. */
export async function partageLien(lien: string, texte: string): Promise<boolean> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'FACE-OFF', text: texte, url: lien });
      return true;
    }
    await navigator.clipboard.writeText(lien);
    return true;
  } catch {
    return false;
  }
}

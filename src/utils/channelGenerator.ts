// Générateur de noms de canaux pour SoarX Voice

const PREFIXES = ['VOL', 'FLY', 'SOAR', 'AILE', 'VENT', 'CIEL'];

/**
 * Génère un nom de canal aléatoire au format PREFIX-NN
 * Exemple : "SOAR-07", "VOL-42"
 */
export function generateChannelName(): string {
  const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const number = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
  return `${prefix}-${number}`;
}

/**
 * Vérifie qu'un nom de canal est valide :
 * - non vide
 * - 30 caractères maximum
 * - uniquement lettres, chiffres et tirets
 */
export function isValidChannelName(name: string): boolean {
  if (name.length === 0 || name.length > 30) {
    return false;
  }
  return /^[a-zA-Z0-9-]+$/.test(name);
}

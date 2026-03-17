import {generateChannelName, isValidChannelName} from '../channelGenerator';

describe('generateChannelName', () => {
  it('retourne un code au format XXXX-NN', () => {
    const name = generateChannelName();
    expect(name).toMatch(/^[A-Z]{3,5}-\d{2}$/);
  });

  it('génère des codes différents à chaque appel', () => {
    const names = new Set(Array.from({length: 20}, () => generateChannelName()));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('isValidChannelName', () => {
  it('accepte un code alphanumérique avec tiret', () => {
    expect(isValidChannelName('TARIFA-01')).toBe(true);
  });

  it('accepte des lettres minuscules', () => {
    expect(isValidChannelName('vol-42')).toBe(true);
  });

  it('refuse un code vide', () => {
    expect(isValidChannelName('')).toBe(false);
  });

  it('refuse un code de plus de 30 caractères', () => {
    expect(isValidChannelName('A'.repeat(31))).toBe(false);
  });

  it('refuse les caractères spéciaux', () => {
    expect(isValidChannelName('canal@#!')).toBe(false);
  });
});

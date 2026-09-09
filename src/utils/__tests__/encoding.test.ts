import {utf8Encode, utf8Decode} from '../encoding';

describe('utf8 codec', () => {
  const roundTrip = (s: string) => utf8Decode(utf8Encode(s));

  it('preserves plain ASCII', () => {
    expect(roundTrip('Xavier')).toBe('Xavier');
  });

  it('preserves accented French names', () => {
    // This is the regression the old `charCodeAt(i) & 0xff` codec caused.
    for (const name of ['Frédéric', 'Loïc', 'Jérôme', 'Anaïs', 'Père Noël']) {
      expect(roundTrip(name)).toBe(name);
    }
  });

  it('preserves non-latin scripts and emoji', () => {
    expect(roundTrip('Ελλάδα')).toBe('Ελλάδα');
    expect(roundTrip('東京')).toBe('東京');
    expect(roundTrip('🪂 parapente')).toBe('🪂 parapente');
  });

  it('survives a JSON payload like the data stream sends', () => {
    const msg = JSON.stringify({type: 'name', name: 'Frédéric'});
    expect(JSON.parse(roundTrip(msg))).toEqual({type: 'name', name: 'Frédéric'});
  });

  it('encodes ASCII as one byte per character', () => {
    expect(utf8Encode('abc')).toHaveLength(3);
  });

  it('encodes a 2-byte sequence for accented characters', () => {
    expect(utf8Encode('é')).toHaveLength(2);
  });

  it('handles the empty string', () => {
    expect(roundTrip('')).toBe('');
  });
});

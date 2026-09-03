import { describe, expect, it } from 'vitest';
import {
  combinedOddsMilli,
  selectionsFromFormData,
  slipTitle,
} from '@/lib/predictions/slip';

describe('combined odds', () => {
  it('multiplies the legs and rounds once', () => {
    expect(combinedOddsMilli([{ oddsMilli: 1850 }, { oddsMilli: 2100 }])).toBe(
      3885,
    );
  });

  it('is the single leg for a single bet', () => {
    expect(combinedOddsMilli([{ oddsMilli: 1720 }])).toBe(1720);
  });

  it('is 1.00 for no legs', () => {
    expect(combinedOddsMilli([])).toBe(1000);
  });
});

describe('slip title', () => {
  it('names a single bet by its match and pick', () => {
    expect(
      slipTitle([{ eventKa: 'დინამო vs საბურთალო', pickKa: 'ჯამური 2.5+' }]),
    ).toBe('დინამო vs საბურთალო · ჯამური 2.5+');
  });

  it('counts the legs after the first', () => {
    expect(
      slipTitle([
        { eventKa: 'დინამო vs საბურთალო', pickKa: 'ჯამური 2.5+' },
        { eventKa: 'რეალი vs ბარსა', pickKa: '1' },
        { eventKa: 'ლაციო vs რომა', pickKa: 'X' },
      ]),
    ).toBe('დინამო vs საბურთალო · ჯამური 2.5+ +2');
  });

  it('has nothing to say about no legs', () => {
    expect(slipTitle([])).toBeNull();
  });
});

describe('rows from the form', () => {
  it('zips the repeated fields and drops rows left entirely blank', () => {
    const form = new FormData();
    form.append('selectionEvent', 'დინამო vs საბურთალო');
    form.append('selectionPick', 'ჯამური 2.5+');
    form.append('selectionOdds', '1.85');
    form.append('selectionEvent', '');
    form.append('selectionPick', '');
    form.append('selectionOdds', '');
    expect(selectionsFromFormData(form)).toEqual([
      { eventKa: 'დინამო vs საბურთალო', pickKa: 'ჯამური 2.5+', odds: '1.85' },
    ]);
  });

  it('keeps a half-filled row so validation can name the gap', () => {
    const form = new FormData();
    form.append('selectionEvent', 'რეალი vs ბარსა');
    form.append('selectionPick', '');
    form.append('selectionOdds', '2.1');
    expect(selectionsFromFormData(form)).toEqual([
      { eventKa: 'რეალი vs ბარსა', pickKa: '', odds: '2.1' },
    ]);
  });
});

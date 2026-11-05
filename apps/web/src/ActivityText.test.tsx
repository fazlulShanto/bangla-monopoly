import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ActivityText from './ActivityText';

function renderActivity(text: string, playerNames = ['Chaya']) {
  const html = renderToStaticMarkup(<ActivityText text={text} playerNames={playerNames} />);
  expect(html.replace(/<[^>]+>/g, '')).toBe(renderToStaticMarkup(text));
  return html;
}

describe('activity highlights', () => {
  test('highlights the player, payment, amount, and tax name without changing the sentence', () => {
    const html = renderActivity('Chaya paid ৳200 in Income tax.');
    expect(html).toContain('activity-highlight--player">Chaya</strong>');
    expect(html).toContain('activity-highlight--action">paid</strong>');
    expect(html).toContain('activity-highlight--amount">৳200</strong>');
    expect(html).toContain('activity-highlight--place">Income tax</strong>');
  });

  test('highlights arrivals and passing Go', () => {
    expect(renderActivity('Chaya arrived at Income tax.')).toContain('activity-highlight--action">arrived at</strong>');
    const html = renderActivity('Chaya passed Go and collected ৳200.');
    expect(html).toContain('activity-highlight--place">Go</strong>');
    expect(html).toContain('activity-highlight--action">collected</strong>');
  });

  test('matches full player names and formatted amounts without highlighting parts of other words', () => {
    const html = renderActivity('Anna paid ৳1,200 rent to Ann.', ['Ann', 'Anna']);
    expect(html).toContain('activity-highlight--player">Anna</strong>');
    expect(html).toContain('activity-highlight--player">Ann</strong>');
    expect(html).toContain('activity-highlight--amount">৳1,200</strong>');
    expect(renderActivity('A dividend arrives.', ['Avi'])).not.toContain('activity-highlight--player');
  });

  test('treats punctuation in names literally and prefers the complete airport name', () => {
    const html = renderActivity("A+B (ঢাকা) bought Cox's Bazar Airport for ৳200.", ['A+B (ঢাকা)']);
    expect(html).toContain('activity-highlight--player">A+B (ঢাকা)</strong>');
    expect(html).toContain('activity-highlight--place">Cox&#x27;s Bazar Airport</strong>');
  });

  test('keeps unknown event text and player-supplied markup as text', () => {
    expect(renderActivity('A new event happened.')).toBe('A new event happened.');
    const html = renderActivity('<b>Chaya</b> rolled 1 + 6.', ['<b>Chaya</b>']);
    expect(html).toContain('&lt;b&gt;Chaya&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });
});

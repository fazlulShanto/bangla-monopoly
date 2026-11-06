import { ArrowRight } from 'lucide-react';
import { Modal } from '../../ui';

export default function UnoRules({ onClose }: { onClose: () => void }) {
  return <Modal title="One card away from glory." onClose={onClose} className="uno-modal">
    <p className="uno-modal-intro">2–6 players. Seven cards each. First to empty their hand wins the round.</p>
    <div className="uno-rule-list">
      <section><h3>Match it. Play it.</h3><p>Play a card that matches the discard’s color, number, or symbol. Wild cards let you choose the next color.</p></section>
      <section><h3>Change the game.</h3><p>Skip misses the next player. Reverse changes direction; with two players, it acts as a skip. +2 and +4 make the next player draw and miss their turn.</p></section>
      <section><h3>Need a card?</h3><p>Draw one card. If it fits, play that card or pass. Otherwise your turn ends automatically. You may draw even if you have a match.</p></section>
      <section><h3>Don’t forget UNO.</h3><p>With two cards left, turn on “Say UNO” before playing. If you forget, call UNO before another player catches you and makes you draw two.</p></section>
      <section><h3>Our table rules</h3><p>No stacking draw cards. Play a Wild +4 only when you have no card of the current color. There are no Wild +4 challenges. The first discard is a number card. Each game is one round.</p></section>
    </div>
    <button className="uno-button uno-button-primary" onClick={onClose}>Let’s play <ArrowRight size={17} /></button>
  </Modal>;
}


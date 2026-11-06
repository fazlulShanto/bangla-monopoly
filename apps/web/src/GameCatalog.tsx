import { ArrowRight, Dices, UsersRound } from 'lucide-react';
import { UnoShowcase } from './games/uno/UnoCards';
import './game-catalog.css';
import './games/uno/uno.css';

const games = [{
  name: 'Deshi Tycoon',
  href: '/games/deshi-tycoon',
  image: '/locations/dhaka.jpg',
  edition: 'Bangladesh edition',
  players: '2–6 players',
  genre: 'Board game',
  description: 'Buy landmarks, make deals, and build your empire across Bangladesh.',
}, {
  name: 'UNO',
  href: '/games/uno',
  image: null,
  edition: 'The colorful classic',
  players: '2–6 players',
  genre: 'Card game',
  description: 'Match colors, turn the tables, and race your friends to the very last card.',
}];

export default function GameCatalog() {
  return <div className="catalog">
    <header className="catalog-header">
      <div className="catalog-header-inner">
        <div className="catalog-brand"><span className="brand-mark"><Dices size={23} strokeWidth={2.3} /></span><span>GAME NIGHT</span></div>
        <span className="catalog-header-note">Made for playing together.</span>
      </div>
    </header>
    <main className="catalog-main">
      <section className="catalog-intro" aria-labelledby="catalog-title">
        <h1 id="catalog-title">Good games.<br /><span>Better together.</span></h1>
        <p>Gather your people, pick a game, and make a little room for fun.</p>
      </section>
      <section className="catalog-games" aria-labelledby="games-title">
        <div className="catalog-section-heading"><div><h2 id="games-title">Pick your game</h2><p>Choose a game to get your table started.</p></div><span>{games.length} {games.length === 1 ? 'game' : 'games'} available</span></div>
        <div className="catalog-grid">
          {games.map((game) => <a className="game-card" href={game.href} key={game.href}>
            <div className={`game-card-art${game.name === 'UNO' ? ' game-card-art-uno' : ''}`}>{game.image ? <img src={game.image} alt="" /> : <UnoShowcase />}<span>{game.edition}</span></div>
            <div className="game-card-content">
              <div className="game-card-meta"><span><UsersRound size={15} />{game.players}</span><span>{game.genre}</span></div>
              <h3>{game.name}</h3>
              <p>{game.description}</p>
              <span className="game-card-action">Play game <ArrowRight size={17} /></span>
            </div>
          </a>)}
        </div>
      </section>
    </main>
    <footer className="catalog-footer"><span>Made for game nights.</span><span>Made for Bangladesh.</span></footer>
  </div>;
}

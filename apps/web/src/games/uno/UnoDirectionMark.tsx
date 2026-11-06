export default function UnoDirectionMark({ direction }: { direction: 1 | -1 }) {
  return <svg className={`uno-direction-mark${direction === -1 ? ' is-reversed' : ''}`} viewBox="0 0 360 240" preserveAspectRatio="none" role="img" aria-label={`Play moves ${direction === 1 ? 'clockwise' : 'counterclockwise'}`}>
    <g key={direction} className="uno-direction-arrows">
      <path d="M40 58C70-2 290-2 326 70C338 88 342 106 342 124" />
      <path className="uno-direction-tip" d="M328 108L342 128L356 108Z" />
      <path d="M320 182C290 242 70 242 34 170C22 152 18 134 18 116" />
      <path className="uno-direction-tip" d="M4 132L18 112L32 132Z" />
    </g>
  </svg>;
}

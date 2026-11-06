import { useId } from 'react';

export default function UnoDirectionMark({ direction }: { direction: 1 | -1 }) {
  const paintId = useId();

  return <svg className={`uno-direction-mark${direction === -1 ? ' is-reversed' : ''}`} viewBox="0 0 360 164" preserveAspectRatio="none" role="img" aria-label={`Play moves ${direction === 1 ? 'clockwise' : 'counterclockwise'}`}>
    <defs>
      <pattern id={`${paintId}-weave`} width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M-1 1L5 7M3-1L7 3" stroke="black" strokeOpacity=".18" strokeWidth=".8" />
        <path d="M1 3h.8M4 1h.5" stroke="black" strokeOpacity=".28" strokeWidth=".7" />
      </pattern>
      <mask id={paintId} maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="164">
        <rect width="360" height="164" fill="white" />
        <rect width="360" height="164" fill={`url(#${paintId}-weave)`} />
      </mask>
    </defs>
    <g key={direction} className="uno-direction-arrows" mask={`url(#${paintId})`}>
      <path d="M46 146C14 130 6 89 23 51L11 45L43 23L48 63L36 57C24 89 29 122 46 146Z" />
      <path d="M46 146C14 130 6 89 23 51L11 45L43 23L48 63L36 57C24 89 29 122 46 146Z" transform="rotate(180 180 82)" />
    </g>
  </svg>;
}

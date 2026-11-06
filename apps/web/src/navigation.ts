export function isTycoonPage(location: Pick<Location, 'pathname' | 'search'>): boolean {
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  return pathname === '/games/deshi-tycoon'
    || (pathname === '/' && new URLSearchParams(location.search).has('room'));
}

export function isUnoPage(location: Pick<Location, 'pathname'>): boolean {
  return location.pathname.replace(/\/+$/, '') === '/games/uno';
}

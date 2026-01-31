// router.js — minimal screen-based view manager

export const SCREENS = {
  HOME: 'home',
  PROJECT: 'project',
  CHAT: 'chat',
};

let _current = SCREENS.HOME;
const _listeners = [];

export function navigateTo(screen) {
  if (_current === screen) return;
  _current = screen;
  for (const cb of _listeners) cb(screen);
}

export function onScreenChange(cb) {
  _listeners.push(cb);
}

export function getCurrentScreen() {
  return _current;
}

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { useStore } from '../src/store/store';

// Tell React this is an act() environment.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  useStore.getState().closeTournament();
  localStorage.clear();
});

const text = (el: Element | null) => el?.textContent ?? '';
const q = (sel: string) => container!.querySelector(sel);
const qa = (sel: string) => Array.from(container!.querySelectorAll(sel));
const button = (label: string) => qa('button').find((b) => text(b).trim() === label) as HTMLButtonElement | undefined;

const click = (el: Element | undefined | null) => {
  expect(el, 'element to click').toBeTruthy();
  act(() => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<App />));
}

describe('UI smoke test', () => {
  it('walks from the menu through setup into a running tournament', () => {
    mount();
    expect(text(container)).toContain('Create New Tournament');

    click(button('Create New Tournament'));
    expect(text(container)).toContain('Tournament Settings');
    expect(button('Start Tournament')!.disabled).toBe(true); // no players yet

    for (let i = 0; i < 8; i++) click(button('Add One Player'));
    expect(qa('tbody tr').length).toBe(8);
    expect(button('Start Tournament')!.disabled).toBe(false);

    click(button('Start Tournament'));
    expect(text(container)).toContain('Settings Preview');
    expect(text(container)).toContain('Freed Jyanshi 8');

    click(button('Confirm'));
    // Now in the tournament view with all five tabs.
    for (const tab of ['Standings', 'Hanchan History', 'Round Management', 'Player Management', 'Tournament Management']) {
      expect(button(tab), tab).toBeTruthy();
    }
    expect(qa('tbody tr').length).toBe(8);
    expect(text(q('.header'))).toContain('My Awesome Mahjong Tournament');
    expect(text(q('.header'))).toContain('--:--:--');
  });

  it('creates pairings, confirms them, and shows them in the hanchan history', () => {
    mount();
    click(button('Create New Tournament'));
    for (let i = 0; i < 8; i++) click(button('Add One Player'));
    click(button('Start Tournament'));
    click(button('Confirm'));

    click(button('Round Management'));
    click(button('Create Pairings'));
    expect(text(container)).toContain('Round Pairings');
    expect(text(container)).toContain('Table 1');
    expect(text(container)).toContain('Table 2');
    click(button('Confirm Pairings'));

    expect(useStore.getState().tournament.tables.length).toBe(2);
    expect(text(container)).toContain('Active Tables');

    click(button('Hanchan History'));
    expect(text(container)).toContain('Round 1, Table 1');

    // Opening a table shows the score form with the start points prefilled.
    click(qa('tr.group')[0]);
    expect(text(container)).toContain('Missing Points');
    expect(button('Submit Scores')).toBeTruthy();
    click(button('Cancel'));
    expect(text(container)).not.toContain('Missing Points');
  });

  it('starting a round starts the countdown', () => {
    mount();
    click(button('Create New Tournament'));
    for (let i = 0; i < 4; i++) click(button('Add One Player'));
    click(button('Start Tournament'));
    click(button('Confirm'));
    click(button('Round Management'));
    click(button('Start Round'));
    expect(text(q('.timer-button'))).toMatch(/^01:1[45]:\d\d$/); // default 75 minutes
  });

  it('offers to resume an autosaved tournament after returning to the menu', () => {
    mount();
    click(button('Create New Tournament'));
    for (let i = 0; i < 4; i++) click(button('Add One Player'));
    click(button('Start Tournament'));
    click(button('Confirm'));

    act(() => useStore.getState().closeTournament());
    expect(text(container)).toContain('Continue “My Awesome Mahjong Tournament”');
    click(qa('button').find((b) => text(b).startsWith('Continue')));
    expect(useStore.getState().tournament.registeredPlayers.length).toBe(4);
  });
});

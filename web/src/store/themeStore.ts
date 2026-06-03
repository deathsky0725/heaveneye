/**
 * Theme Store — Phase 3.7
 * Dark/Light theme toggle with localStorage persistence + smooth CSS transition.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';

interface ThemeState {
  currentTheme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      currentTheme: 'dark',
      toggleTheme: () =>
        set((s) => ({ currentTheme: s.currentTheme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ currentTheme: theme }),
    }),
    {
      name: 'heaveneye-theme',
    }
  )
);

/**
 * Apply the theme class to <html> element with smooth transition.
 * dark class = dark mode; no class (light) = light mode.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  setTimeout(() => root.classList.remove('theme-transition'), 350);
}
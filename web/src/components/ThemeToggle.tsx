import { motion } from 'motion/react';
import { useThemeStore } from '../store/themeStore';

export function ThemeToggle() {
  const { currentTheme: theme, toggleTheme } = useThemeStore();

  return (
    <button
      onClick={toggleTheme}
      title={`Toggle theme (T) — currently ${theme}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="
        relative w-8 h-8 rounded-lg flex items-center justify-center
        bg-slate-700/60 hover:bg-slate-600/80 border border-slate-600/50
        text-slate-300 hover:text-yellow-300
        transition-colors duration-200
        focus-ring
      "
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
        className="text-base leading-none"
      >
        {theme === 'dark' ? (
          // Sun icon for dark mode (click to go light)
          <span aria-hidden="true">☀️</span>
        ) : (
          // Moon icon for light mode (click to go dark)
          <span aria-hidden="true">🌙</span>
        )}
      </motion.div>
    </button>
  );
}
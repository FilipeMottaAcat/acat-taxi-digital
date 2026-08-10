import { useTheme } from "../hooks/useTheme";

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className={floating ? "toggle-float" : "iconbtn"}
      onClick={toggle}
      aria-label="Alternar tema"
      title="Alternar tema claro/escuro"
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}

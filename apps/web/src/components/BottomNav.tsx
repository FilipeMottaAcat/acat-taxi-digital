import { NavLink } from "react-router-dom";

export interface BottomNavItem {
  to: string;
  label: string;
  end?: boolean;
}

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav className="bottom">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="dot" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

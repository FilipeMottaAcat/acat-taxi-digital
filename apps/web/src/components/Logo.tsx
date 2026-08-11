/** ACAT wordmark — two pre-rendered variants (light/dark wordmark text) swapped by CSS
 * based on `html[data-theme]`, since the badge mark itself has a transparent background. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`logo ${className ?? ""}`}>
      <img src="/logo-dark.png" alt="ACAT Táxi Digital" className="logo-img logo-img-dark" />
      <img src="/logo-light.png" alt="ACAT Táxi Digital" className="logo-img logo-img-light" />
    </span>
  );
}

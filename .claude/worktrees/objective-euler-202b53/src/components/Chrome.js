/**
 * Chrome — top navigation bar + footer for non-landing pages
 * (the landing page has its own editorial topbar/footer).
 */
export default function Chrome({ children }) {
  return (
    <>
      <nav
        className="bg-navy/95 backdrop-blur-md text-white shadow-lg border-b border-white/5 sticky top-0 z-50"
        aria-label="Main navigation"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a
              href="/"
              className="flex items-center space-x-3 group"
              aria-label="Muuchstac Scout — Home"
            >
              <svg width="36" height="36" viewBox="0 0 36 36" className="flex-shrink-0">
                <rect width="36" height="36" rx="8" fill="#000000" />
                <rect x="4" y="8" width="8" height="20" rx="2" fill="#5BC8FF" />
                <rect x="14" y="8" width="8" height="20" rx="2" fill="#2B95DA" />
                <rect x="24" y="8" width="8" height="20" rx="2" fill="#878787" />
              </svg>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight leading-none">
                  Muuchstac Scout
                </span>
                <span className="text-[10px] text-gray-400 font-medium tracking-widest uppercase leading-none mt-0.5">
                  Godrej Consumer Products
                </span>
              </div>
            </a>
            <div className="flex items-center space-x-1">
              <a
                href="/"
                className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
              >
                Search
              </a>
              <a
                href="/about"
                className="px-3 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
              >
                Methodology
              </a>
              <div className="ml-4 pl-4 border-l border-white/10 hidden sm:flex items-center">
                <span className="text-[10px] px-2.5 py-1 rounded-full border border-godrej-sky/30 text-godrej-sky font-semibold tracking-wide">
                  GURUKUL 2026
                </span>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
      <footer className="bg-navy text-gray-500 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <p>Built for GCPL Gurukul 2026</p>
            <p>Powered by Claude AI &amp; YouTube Data API v3</p>
            <p>By Shashwat, XLRI Jamshedpur</p>
          </div>
        </div>
      </footer>
    </>
  );
}

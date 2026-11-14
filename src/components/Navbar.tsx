import React, { useState } from 'react';
import { Menu, X, Sprout, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface NavbarProps {
  activeView: 'public' | 'dashboard' | 'video';
  onNavigatePublic: (sectionId?: string) => void;
  onOpenDashboard: () => void;
  onOpenAuthModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onNavigatePublic,
  onOpenDashboard,
  onOpenAuthModal,
}) => {
  const { firebaseUser, userAccount, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: 'Beranda', target: 'beranda' },
    { label: 'Tentang Kami', target: 'tentang' },
    { label: 'Layanan', target: 'layanan' },
    { label: 'Artikel', target: 'artikel' },
    { label: 'Kontak', target: 'kontak' },
  ];

  const handleLinkClick = (target: string) => {
    setMobileMenuOpen(false);
    onNavigatePublic(target);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#EAE3D2] bg-[#F7F4EC]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLinkClick('beranda')}
          className="flex items-center gap-2.5 text-left text-lg font-bold tracking-tight text-[#315E4B] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315E4B]"
        >
          <Sprout className="h-5 w-5 text-[#315E4B] shrink-0" aria-hidden="true" />
          <span>Ruang Tumbuh</span>
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        {activeView === 'public' ? (
          <nav
            aria-label="Navigasi utama"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#3B4D43]"
          >
            {navItems.map((item) => (
              <button
                key={item.target}
                type="button"
                onClick={() => handleLinkClick(item.target)}
                className="relative py-1 hover:text-[#315E4B] transition-colors whitespace-nowrap shrink-0 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-0 after:bg-[#315E4B] after:transition-all hover:after:w-full"
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#3B4D43]">
            <button
              type="button"
              onClick={() => handleLinkClick('beranda')}
              className="hover:text-[#315E4B] transition-colors whitespace-nowrap shrink-0"
            >
              Kembali ke Beranda
            </button>
          </div>
        )}

        {/* Zone 3: Single primary action */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {firebaseUser && userAccount ? (
            <div className="flex items-center gap-3">
              {activeView !== 'dashboard' && (
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#315E4B] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#244738] transition-colors whitespace-nowrap shrink-0"
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  <span>Dashboard</span>
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4E0D5] bg-white px-3.5 py-2.5 text-sm font-medium text-[#315E4B] hover:bg-[#EBF0EC] transition-colors whitespace-nowrap shrink-0"
                title="Keluar dari akun"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="rounded-lg bg-[#315E4B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#244738] transition-colors whitespace-nowrap shrink-0"
            >
              Masuk / Daftar
            </button>
          )}
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="lg:hidden inline-flex items-center justify-center rounded-lg border border-[#EAE3D2] bg-white p-2.5 text-[#315E4B]"
          aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#EAE3D2] bg-[#F7F4EC] px-6 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.target}
              type="button"
              onClick={() => handleLinkClick(item.target)}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#3B4D43] hover:bg-[#EBF0EC] hover:text-[#315E4B]"
            >
              {item.label}
            </button>
          ))}
          <div className="pt-2 border-t border-[#EAE3D2] flex flex-col gap-2">
            {firebaseUser && userAccount ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenDashboard();
                  }}
                  className="w-full rounded-lg bg-[#315E4B] px-4 py-2.5 text-sm font-medium text-white"
                >
                  Buka Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full rounded-lg border border-[#D4E0D5] bg-white px-4 py-2.5 text-sm font-medium text-[#315E4B]"
                >
                  Keluar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuthModal();
                }}
                className="w-full rounded-lg bg-[#315E4B] px-4 py-2.5 text-sm font-medium text-white"
              >
                Masuk / Daftar
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

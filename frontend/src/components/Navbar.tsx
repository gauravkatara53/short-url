import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Link2, BarChart3, LogOut, Plus, User as UserIcon } from 'lucide-react';
import { getStoredUser, logoutApi } from '../api/auth';

interface NavbarProps {
  onOpenCreateModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreateModal }) => {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    logoutApi();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Brand */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Link2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-800">
                Click<span className="text-[#f36601]">Stream</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider font-semibold text-slate-400 bg-gray-100 px-1.5 py-0.5 rounded">
                Analytics
              </span>
            </div>
          </Link>

          {/* Navigation links */}
          {user && (
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                <BarChart3 className="w-4 h-4 text-slate-400" />
                My URLs
              </Link>
            </nav>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {onOpenCreateModal && (
                <button
                  onClick={onOpenCreateModal}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-full flex items-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Shorten URL</span>
                </button>
              )}

              <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
                <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-semibold text-slate-700">{user.name}</div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[120px]">{user.email}</div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-full transition-colors shadow-sm"
              >
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

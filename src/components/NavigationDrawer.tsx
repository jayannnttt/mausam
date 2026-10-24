/**
 * NavigationDrawer — 3-Lines Hamburger Menu & Navigation Drawer.
 *
 * Provides organized navigation between:
 * - Basic Dashboard (Home)
 * - Rain Report
 * - Wind Report
 * - Air Quality
 * - Mausam Prediction (SIH 2026 Trained ML Model)
 */

import { useEffect, useRef } from "react";
import {
  Menu,
  X,
  Home,
  CloudRain,
  Wind,
  Gauge,
  Brain,
  Settings,
  Globe,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { usePreferences } from "../state/preferencesContext";

export type DashboardTab = "home" | "rain" | "wind" | "air-quality" | "prediction";

interface NavigationDrawerProps {
  open: boolean;
  onClose: () => void;
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  onOpenSettings: () => void;
  onOpenLanguage: () => void;
  currentLanguageName: string;
}

export function NavigationDrawer({
  open,
  onClose,
  activeTab,
  onSelectTab,
  onOpenSettings,
  onOpenLanguage,
  currentLanguageName,
}: NavigationDrawerProps) {
  const { t } = usePreferences();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const navItems: {
    id: DashboardTab;
    label: string;
    subtitle: string;
    icon: typeof Home;
    badge?: string;
    highlight?: boolean;
  }[] = [
    {
      id: "home",
      label: t.tabHome,
      subtitle: t.homeNavSub,
      icon: Home,
    },
    {
      id: "rain",
      label: t.tabRain,
      subtitle: t.rainNavSub,
      icon: CloudRain,
    },
    {
      id: "wind",
      label: t.tabWind,
      subtitle: t.windNavSub,
      icon: Wind,
    },
    {
      id: "air-quality",
      label: t.tabAirQuality,
      subtitle: t.airQualityNavSub,
      icon: Gauge,
    },
    {
      id: "prediction",
      label: t.tabPrediction,
      subtitle: t.predictionNavSub,
      icon: Brain,
      badge: t.smartBadge,
      highlight: true,
    },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-ink-950/40 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation Menu"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-sm flex-col bg-surface border-r border-line shadow-2xl transition-transform"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-pine p-1.5 text-surface">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-ink-950 uppercase">
                Mausam Sense
              </h2>
              <p className="text-[11px] text-ink-500 font-editorial italic">
                {t.navigationMenu}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-ink-500 hover:bg-line-subtle hover:text-ink-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Menu Navigation Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            {t.navDashboards}
          </p>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onClose();
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition-all ${
                  isActive
                    ? "bg-pine text-surface shadow-xs font-semibold"
                    : "hover:bg-line-subtle/70 text-ink-800"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`rounded-lg p-2 transition-colors ${
                      isActive
                        ? "bg-surface/20 text-surface"
                        : item.highlight
                        ? "bg-pine/10 text-pine"
                        : "bg-line-subtle text-ink-700"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isActive ? "text-surface font-bold" : "text-ink-900 font-semibold"}`}>
                        {item.label}
                      </span>
                      {item.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            isActive
                              ? "bg-surface text-pine"
                              : "bg-pine/15 text-pine"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs truncate ${
                        isActive ? "text-surface/80" : "text-ink-500"
                      }`}
                    >
                      {item.subtitle}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 transition-transform ${
                    isActive ? "text-surface" : "text-ink-400 group-hover:translate-x-0.5"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Drawer Footer Actions */}
        <div className="border-t border-line p-4 space-y-2 bg-surface/50">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            {t.settingsTitle}
          </p>

          <button
            type="button"
            onClick={() => {
              onOpenLanguage();
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-line-subtle transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Globe className="h-4 w-4 text-pine" />
              <span>{t.changeLanguage}: <strong>{currentLanguageName}</strong></span>
            </div>
            <span className="text-[11px] text-pine font-semibold">{t.changeLanguage}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-line-subtle transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Settings className="h-4 w-4 text-ink-600" />
              <span>{t.settings}</span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

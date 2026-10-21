/**
 * Language selection component displaying all 22 official Indian languages + English.
 * Works both as an embedded onboarding view and as an interactive modal from the top header.
 */

import { useState, useMemo } from "react";
import { Check, Globe, Search, X } from "lucide-react";
import { INDIAN_LANGUAGES, type LanguageOption } from "../i18n/languages";
import { usePreferences } from "../state/preferencesContext";

export function LanguageGrid({
  selectedCode,
  onSelect,
}: {
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INDIAN_LANGUAGES;
    return INDIAN_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="space-y-4">
      {/* Search Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search language / भाषा खोजें / மொழியைத் தேடுங்கள்..."
          className="w-full rounded-md border border-line bg-paper py-2 pl-9 pr-4 text-xs sm:text-sm text-ink-900 placeholder:text-ink-400 focus:border-pine focus:outline-none transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-ink-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Language Cards Grid */}
      <div className="grid max-h-[55vh] sm:max-h-[440px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
        {filtered.map((lang) => {
          const isSelected = lang.code === selectedCode;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => onSelect(lang.code)}
              aria-pressed={isSelected}
              className={`group relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all ${
                isSelected
                  ? "border-pine bg-pine-surface text-pine-dark ring-1 ring-pine shadow-xs"
                  : "border-line bg-surface text-ink-800 hover:border-ink-300 hover:bg-line-subtle/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="block text-sm font-semibold tracking-wide text-ink-950">
                    {lang.nativeName}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {lang.name}
                  </span>
                </div>
                {isSelected ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-pine text-surface">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                ) : (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-mono uppercase text-ink-400 group-hover:text-pine">
                    {lang.code}
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-line-subtle pt-1.5 text-[11px]">
                <span className="truncate text-ink-400" title={lang.region}>
                  {lang.region}
                </span>
                <span className="shrink-0 font-medium text-pine">
                  {lang.welcome}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-ink-400">
          No languages matching "{query}".
        </div>
      )}
    </div>
  );
}

export function LanguageSelectorModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { language, setLanguage, t } = usePreferences();

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-3 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-surface p-4 shadow-lift sm:p-6 text-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pine-surface text-pine border border-pine-border">
              <Globe className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-950">{t.selectLanguage}</h2>
              <p className="text-xs text-ink-500">{t.allOfficialLanguages}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-line-subtle hover:text-ink-900 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <LanguageGrid
          selectedCode={language}
          onSelect={(code) => {
            setLanguage(code);
            onClose();
          }}
        />

        <div className="mt-4 flex justify-end border-t border-line pt-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary px-5 text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

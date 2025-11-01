'use client';

import { useState } from 'react';
import { SUPPORTED_LOCALES, createLocaleMessage } from '../types/locale';

interface LocaleSelectorProps {
  currentLocale: string;
  onLocaleChange: (locale: string) => void;
}

export default function LocaleSelector({ currentLocale, onLocaleChange }: LocaleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleLocaleChange = (locale: string) => {
    onLocaleChange(locale);
    setIsOpen(false);
    try {
      localStorage.setItem('current_locale', locale);
    } catch {}
    
    // Send locale change message to Sandpack preview
    const message = createLocaleMessage(locale);
    
    // Target the Sandpack iframe specifically
    const sandpackIframe = document.querySelector('iframe[title="Sandpack Preview"]') as HTMLIFrameElement;
    if (sandpackIframe && sandpackIframe.contentWindow) {
      sandpackIframe.contentWindow.postMessage(message, '*');
    }
    
    // Also send to window for fallback
    window.postMessage(message, '*');
  };

  const currentLocaleData = SUPPORTED_LOCALES.find(l => l.code === currentLocale);

  return (
    <div className="relative z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
        aria-label="Select language"
      >
        <span className="text-lg" role="img" aria-label={currentLocaleData?.name}>
          {currentLocaleData?.flag || '🇺🇸'}
        </span>
        <span className="text-gray-700 dark:text-gray-300 font-medium">
          {currentLocaleData?.code.toUpperCase() || 'EN'}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-lg z-50 py-1 px-1 flex items-center gap-1 whitespace-nowrap">
            {SUPPORTED_LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => handleLocaleChange(locale.code)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-full transition-colors ${
                  currentLocale === locale.code 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
                title={`${locale.name} (${locale.code.toUpperCase()})`}
              >
                <span className="text-lg" role="img" aria-label={locale.name}>
                  {locale.flag}
                </span>
                <span className="text-sm font-medium">{locale.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
} 
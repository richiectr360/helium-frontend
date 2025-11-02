'use client';

import { useState, useEffect } from 'react';
import { SandpackProvider, SandpackPreview } from '@codesandbox/sandpack-react';
import { getAllLocalizations, getTranslations as getLocaleMap } from '../lib/database';
import LocaleSelector from './LocaleSelector';

interface ComponentPreviewProps {
  componentCode: string;
}

const SAFE_DEFAULT_APP = `import React from 'react';
import Component from './Component';

export default function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <Component />
    </div>
  );
}`;

export default function ComponentPreview({ componentCode }: ComponentPreviewProps) {
  const [processedCode, setProcessedCode] = useState<string>('');
  const [processedAppCode, setProcessedAppCode] = useState<string>(SAFE_DEFAULT_APP);
  const [currentLocale, setCurrentLocale] = useState<string>('en'); // Always start with 'en' for SSR consistency
  const [version, setVersion] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Restore saved locale from localStorage after mount to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    try {
      const stored = localStorage.getItem('current_locale');
      if (stored) setCurrentLocale(stored);
    } catch {}
  }, []);

  // Initialize processedAppCode with __i18n helper on mount if no componentCode yet
  useEffect(() => {
    if (!componentCode.trim() && processedAppCode === SAFE_DEFAULT_APP) {
      setIsLoading(true);
      const setupEmpty = async () => {
        const translations = await getLocaleMap(currentLocale);
        const enTranslations = await getLocaleMap('en');
        const preamble = `\nconst __TX = ${JSON.stringify(translations)};\nconst __EN = ${JSON.stringify(enTranslations)};\nconst __i18n = (k) => {\n  const v = __TX[k];\n  if (v !== undefined && v !== null && v !== '') return v;\n  const en = __EN[k];\n  if (en !== undefined && en !== null && en !== '') return en;\n  if (/^[A-Za-z]+(\.[A-Za-z0-9_]+)+$/.test(k)) {\n    const last = k.split('.').pop();\n    if (last) return (last.charAt(0).toUpperCase() + last.slice(1)).replace(/_/g, ' ');\n  }\n  return k;\n};\n`;
        setProcessedAppCode(SAFE_DEFAULT_APP + preamble);
        setIsLoading(false);
      };
      setupEmpty();
    }
  }, [componentCode, currentLocale]);

  useEffect(() => {
    if (!componentCode.trim()) {
      setProcessedCode('');
      // Provide empty app code with __i18n helper so Sandpack doesn't crash
      const emptyAppBase = `import React from 'react';
import Component from './Component';

export default function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <Component />
    </div>
  );
}`;
      setIsLoading(true);
      const setupEmpty = async () => {
        const translations = await getLocaleMap(currentLocale);
        const enTranslations = await getLocaleMap('en');
        const preamble = `\nconst __TX = ${JSON.stringify(translations)};\nconst __EN = ${JSON.stringify(enTranslations)};\nconst __i18n = (k) => {\n  const v = __TX[k];\n  if (v !== undefined && v !== null && v !== '') return v;\n  const en = __EN[k];\n  if (en !== undefined && en !== null && en !== '') return en;\n  if (/^[A-Za-z]+(\.[A-Za-z0-9_]+)+$/.test(k)) {\n    const last = k.split('.').pop();\n    if (last) return (last.charAt(0).toUpperCase() + last.slice(1)).replace(/_/g, ' ');\n  }\n  return k;\n};\n`;
        setProcessedAppCode(emptyAppBase + preamble);
        setIsLoading(false);
      };
      setupEmpty();
      return;
    }

    // Process the component code for Sandpack
    let code = componentCode.trim();
    
    if (code) {
      // Ensure React import is present
      if (!code.includes('import React') && !code.includes('import * as React')) {
        code = `import React from 'react';\n${code}`;
      }
      
      // Simple hook detection and import fixing
      const needsHooks = [];
      if (code.includes('useState') && !code.includes('{ useState')) {
        needsHooks.push('useState');
      }
      if (code.includes('useEffect') && !code.includes('{ useEffect')) {
        needsHooks.push('useEffect');
      }
      
      if (needsHooks.length > 0) {
        code = code.replace(
          'import React from \'react\';', 
          `import React, { ${needsHooks.join(', ')} } from 'react';`
        );
      }

    }

    setIsLoading(true);
    // Build map from English text -> key from DB and rewrite literals to t('key')
    const rewriteWithKeys = async () => {
      const entries = await getAllLocalizations();
      const textToKey = new Map(entries.map(e => [e.en.trim(), e.key]));
      const allKeys = new Set(entries.map(e => e.key));
      // Alias map for common variations
      const keyAliases: Record<string, string> = {
        'social.home': 'navigation.home',
        'social.about': 'navigation.about',
        'social.services': 'navigation.services',
        'social.contact': 'navigation.contact',
      };
      let out = code;
      const escapeForRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const [text, key] of textToKey.entries()) {
        if (!text) continue;
        const lower = text.toLowerCase();
        if (lower === 'react' || lower === 'use client') continue;
        const e = escapeForRegex(text);
        // Replace JSX text nodes: > 'text' < or > "text" <
        const textSingle = new RegExp(`>\\s*'${e}'\\s*<`, 'g');
        const textDouble = new RegExp(`>\\s*\"${e}\"\\s*<`, 'g');
        out = out.replace(textSingle, `> {__i18n('${key}')} <`).replace(textDouble, `> {__i18n('${key}')} <`);
        // Replace expression-literals: {'text'} or {"text"}
        const exprSingle = new RegExp(`\\{\\s*'${e}'\\s*\\}`, 'g');
        const exprDouble = new RegExp(`\\{\\s*\"${e}\"\\s*\\}`, 'g');
        out = out.replace(exprSingle, `{__i18n('${key}')}`).replace(exprDouble, `{__i18n('${key}')}`);
      }

      // Replace literal key strings like 'profile.name' or "social.home" anywhere
      const keyLike = /(['"])(([A-Za-z]+)(?:\.[A-Za-z0-9_]+)+)\1/g;
      out = out.replace(keyLike, (m, q, k, _g, offset, src) => {
        // Guard: if this appears inside t('...') or __i18n('...'), do not replace
        const before = src.slice(Math.max(0, offset - 12), offset);
        if (/t\(\s*$/.test(before) || /__i18n\(\s*$/.test(before)) {
          return m;
        }
        // Guard: if this is an object key (before : after), do not replace
        const after = src.slice(offset + m.length, offset + m.length + 5);
        if (/^\s*:/.test(after)) {
          return m;
        }
        // Check if key has an alias
        const resolvedKey = keyAliases[k] || k;
        return (allKeys.has(k) || allKeys.has(resolvedKey)) ? `{__i18n('${resolvedKey}')}` : m;
      });

      // Replace t('key.path') invocations with __i18n('key.path')
      // Check if we're in an expression context (already has braces) or need to add them
      const tCall = /t\(\s*['"](([A-Za-z]+)(?:\.[A-Za-z0-9_]+)+)['"]\s*\)/g;
      out = out.replace(tCall, (m, k, _full, offset, src) => {
        const before = src.slice(Math.max(0, offset - 10), offset);
        const after = src.slice(offset + m.length, offset + m.length + 10);
        // If already wrapped in braces (JSX expression) or inside JSX attribute, return unwrapped
        // Check for { before, } after, or inside JSX like >...< or default prop = "
        if (before.match(/\{$/) || after.match(/^\}/) || before.match(/=/)) {
          return `__i18n('${k}')`;
        }
        // Otherwise wrap in braces for JSX text node
        return `{__i18n('${k}')}`;
      });

      // Also replace object fields where the value is a key-like string
      const fields = ['label', 'title', 'description', 'buttonText', 'text', 'placeholder', 'name'];
      for (const f of fields) {
        const propKeySingle = new RegExp(`${f}\\s*:\\s*'(([A-Za-z]+)(?:\\.[A-Za-z0-9_]+)+)'`, 'g');
        const propKeyDouble = new RegExp(`${f}\\s*:\\s*\"(([A-Za-z]+)(?:\\.[A-Za-z0-9_]+)+)\"`, 'g');
        out = out.replace(propKeySingle, (m, k) => {
          const resolvedKey = keyAliases[k] || k;
          return (allKeys.has(k) || allKeys.has(resolvedKey)) ? `${f}: __i18n('${resolvedKey}')` : m;
        });
        out = out.replace(propKeyDouble, (m, k) => {
          const resolvedKey = keyAliases[k] || k;
          return (allKeys.has(k) || allKeys.has(resolvedKey)) ? `${f}: __i18n('${resolvedKey}')` : m;
        });
      }
      // Inject a minimal i18n runtime with English fallback
      const translations = await getLocaleMap(currentLocale);
      const enTranslations = await getLocaleMap('en');
      const preamble = `\nconst __TX = ${JSON.stringify(translations)};\nconst __EN = ${JSON.stringify(enTranslations)};\nconst __i18n = (k) => {\n  const v = __TX[k];\n  if (v !== undefined && v !== null && v !== '') return v;\n  const en = __EN[k];\n  if (en !== undefined && en !== null && en !== '') return en;\n  if (/^[A-Za-z]+(\.[A-Za-z0-9_]+)+$/.test(k)) {\n    const last = k.split('.').pop();\n    if (last) return (last.charAt(0).toUpperCase() + last.slice(1)).replace(/_/g, ' ');\n  }\n  return k;\n};\n`;
      setProcessedCode(out + preamble);
      
      // Extract default children from component if it exists
      let demoChildren = "__i18n('button.click_me')";
      const childrenMatch = out.match(/children\s*[:=]\s*(__i18n\(['"][^'"]+['"]\))/);
      if (childrenMatch) {
        demoChildren = childrenMatch[1];
      } else {
        // Try to find a string literal default like children = 'Submit'
        const stringMatch = out.match(/children\s*[:=]\s*['"]([^'"]+)['"]/);
        if (stringMatch) {
          const text = stringMatch[1];
          // Check if this text maps to a translation key
          if (textToKey.has(text)) {
            demoChildren = `__i18n('${textToKey.get(text)}')`;
          }
        }
      }
      
      // Also inject into App.js (the demo props need it too)
      const appBase = `import React from 'react';
import Component from './Component';

export default function App() {
  const demoProps = {
    items: [
      { label: __i18n('navigation.home'), href: '#home' },
      { label: __i18n('navigation.about'), href: '#about' },
      { label: __i18n('navigation.services'), href: '#services' },
      { label: __i18n('navigation.contact'), href: '#contact' }
    ],
    children: ${demoChildren},
    onClick: () => console.log('Button clicked!'),
    title: __i18n('profile.title'),
    description: __i18n('profile.description'),
    placeholder: __i18n('form.placeholder'),
    text: __i18n('demo.text'),
    name: __i18n('demo.name'),
    value: __i18n('demo.value'),
    locale: '${currentLocale}'
  };

  try {
    return (
      <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
        <Component {...demoProps} />
      </div>
    );
  } catch (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>Component Error</h3>
        <pre>{error.toString()}</pre>
      </div>
    );
  }
}`;
      setProcessedAppCode(appBase + preamble);
      setIsLoading(false);
    };
    rewriteWithKeys();
  }, [componentCode, currentLocale, version]);

  // Listen to localStorage changes and custom events to refresh translations when table edits happen
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'localizations_db' || e.key === 'localizations_db_version') {
        setVersion(v => v + 1);
      }
    };
    
    const onCustomEvent = () => {
      setVersion(v => v + 1);
    };
    
    // Listen for storage events (cross-tab updates)
    window.addEventListener('storage', onStorage);
    // Listen for custom event (same-tab updates)
    window.addEventListener('localizations-updated', onCustomEvent);
    
    // Also poll localStorage for same-tab updates (since StorageEvent doesn't fire in same tab)
    let lastVersion = localStorage.getItem('localizations_db_version');
    const interval = setInterval(() => {
      const currentVersion = localStorage.getItem('localizations_db_version');
      if (currentVersion !== lastVersion) {
        lastVersion = currentVersion;
        setVersion(v => v + 1);
      }
    }, 500); // Check every 500ms
    
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('localizations-updated', onCustomEvent);
      clearInterval(interval);
    };
  }, []);


  // Show a test component when no code is provided
  const displayCode = processedCode || `import React from 'react';

export default function EmptyState() {
  return (
    <div style={{ 
      padding: '40px', 
      textAlign: 'center', 
      color: '#666',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ 
        width: '64px', 
        height: '64px', 
        margin: '0 auto 16px', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16,18 22,12 16,6"></polyline>
          <polyline points="8,6 2,12 8,18"></polyline>
        </svg>
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600' }}>
        Preview Ready
      </h3>
      <p style={{ margin: '0', fontSize: '14px' }}>
        Your component will appear here when generated
      </p>
    </div>
  );
}`;

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-zinc-950 dark:to-zinc-900">
      <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex-shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Live Preview</h2>
          </div>
          <LocaleSelector 
            currentLocale={currentLocale}
            onLocaleChange={setCurrentLocale}
          />
        </div>
      </div>
      
      <div className="flex-1 min-h-0 relative m-4 rounded-lg overflow-hidden shadow-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-gray-700 transition-all duration-300" style={{ height: 'calc(100% - 2rem)', width: 'calc(100% - 2rem)' }}>
        <SandpackProvider
          template="react"
          theme="light"
          files={{
            '/App.js': processedAppCode,
            '/Component.js': displayCode,
            '/styles.css': `
              @tailwind base;
              @tailwind components;
              @tailwind utilities;
            `,
            'postcss.config.js': `
              module.exports = {
                plugins: {
                  tailwindcss: {},
                  autoprefixer: {},
                },
              }
            `,
            'tailwind.config.js': `
              module.exports = {
                content: [
                  './pages/**/*.{js,ts,jsx,tsx}',
                  './components/**/*.{js,ts,jsx,tsx}',
                ],
                theme: {
                  extend: {},
                },
                plugins: [],
              }
            `,
          }}
          style={{
            height: '100%',
            width: '100%'
          }}
          options={{
            autorun: true,
            externalResources: ['https://cdn.tailwindcss.com'],
          }}
        >
          <SandpackPreview
            style={{ 
              height: '100%', 
              width: '100%'
            }}
            showOpenInCodeSandbox={false}
            showRefreshButton={true}
            actionsChildren={null}
          />
        </SandpackProvider>
        {isLoading && (
          <div className="absolute inset-0 pointer-events-none bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm rounded-lg">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 animate-ping">
                    <svg className="h-12 w-12 text-blue-500 opacity-20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    </svg>
                  </div>
                  <svg className="animate-spin h-12 w-12 text-blue-500 relative" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium animate-pulse">Loading preview...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 
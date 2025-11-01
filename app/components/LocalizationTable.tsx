'use client';

import { useState, useEffect } from 'react';
import { LocalizationDB, LocalizationEntry } from '../lib/database';
import { useToast } from '../context/ToastContext';

export default function LocalizationTable() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LocalizationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const db = LocalizationDB.getInstance();

  const [editingCell, setEditingCell] = useState<{ entryId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleEdit = (entryId: string, field: string, currentValue: string) => {
    setEditingCell({ entryId, field });
    setEditValue(currentValue);
  };

  const loadEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await db.getAll();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingCell) return;
    
    try {
      await db.update(editingCell.entryId, editingCell.field, editValue);
      setEntries(prev => prev.map(entry => 
        entry.id === editingCell.entryId 
          ? { ...entry, [editingCell.field]: editValue }
          : entry
      ));
      setEditingCell(null);
      setEditValue('');
      showToast('Translation saved successfully', 'success');
      // Trigger update in preview by incrementing version in localStorage
      try {
        localStorage.setItem('localizations_db_version', Date.now().toString());
      } catch {}
    } catch (error) {
      console.error('Failed to save:', error);
      setError(error instanceof Error ? error.message : 'Failed to save');
      showToast('Failed to save translation', 'error');
    }
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

  const handleAddEntry = async () => {
    const newEntry: Omit<LocalizationEntry, 'created_at' | 'updated_at'> = {
      id: generateId(),
      key: 'new.key',
      en: '',
      es: '',
      fr: '',
      de: '',
      ja: '',
      zh: ''
    };

    try {
      await db.create(newEntry);
      setEntries(prev => [...prev, { ...newEntry, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }].sort((a, b) => a.key.localeCompare(b.key)));
      showToast('Translation key added successfully', 'success');
    } catch (error) {
      console.error('Failed to create entry:', error);
      setError(error instanceof Error ? error.message : 'Failed to create entry');
      showToast('Failed to add translation key', 'error');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      await db.delete(id);
      setEntries(prev => prev.filter(entry => entry.id !== id));
      showToast('Translation key deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete entry:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete entry');
      showToast('Failed to delete translation key', 'error');
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  // Listen for translation updates (from auto-translation or other sources)
  useEffect(() => {
    const handleUpdate = () => {
      loadEntries();
    };

    // Listen for custom event
    window.addEventListener('localizations-updated', handleUpdate);
    
    // Also listen for storage events (for cross-tab updates)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'localizations_db' || e.key === 'localizations_db_version') {
        loadEntries();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('localizations-updated', handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
  ];

  if (loading) {
    return (
      <div className="h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading localizations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-2xl mx-auto px-4">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-600 dark:text-red-400 font-medium mb-2">Failed to load localizations</p>
          <div className="text-gray-600 dark:text-gray-400 text-sm whitespace-pre-line text-left bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            {error}
          </div>
          <div className="mt-4">
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Localization</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Manage translations across languages</p>
          </div>
          <button 
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            onClick={handleAddEntry}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Entry
          </button>
        </div>
      </div>
      
      {/* Stats */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">{entries.length}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Keys</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="text-2xl font-semibold text-blue-700 dark:text-blue-400">{languages.length}</div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Languages</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="text-2xl font-semibold text-green-700 dark:text-green-400">{entries.length * languages.length}</div>
            <div className="text-sm text-green-600 dark:text-green-400">Total Translations</div>
          </div>
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Translation Key
                  </th>
                  {languages.map(lang => (
                    <th key={lang.code} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>{lang.flag}</span>
                        <span>{lang.name}</span>
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={languages.length + 2} className="px-6 py-12 text-center">
                      <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">No translations yet. Create a component to get started!</p>
                    </td>
                  </tr>
                ) : entries.map((entry) => (
                  <tr 
                    key={entry.id} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-white">
                      {editingCell?.entryId === entry.id && editingCell?.field === 'key' ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleSave}
                          className="w-full px-2 py-1 text-sm font-mono bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <div 
                          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-2 py-1 -mx-2 -my-1"
                          onClick={() => handleEdit(entry.id, 'key', entry.key)}
                        >
                          {entry.key}
                        </div>
                      )}
                    </td>
                    {languages.map(lang => (
                      <td key={lang.code} className="px-6 py-4 text-sm text-gray-900 dark:text-white max-w-xs">
                        {editingCell?.entryId === entry.id && editingCell?.field === lang.code ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSave}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        ) : (
                          <div 
                            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 rounded px-2 py-1 -mx-2 -my-1 truncate"
                            onClick={() => handleEdit(entry.id, lang.code, entry[lang.code as keyof LocalizationEntry] as string)}
                          >
                            {entry[lang.code as keyof LocalizationEntry] || (
                              <span className="text-gray-400 dark:text-gray-500 italic text-xs">Click to add translation</span>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button 
                          className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                          onClick={() => handleDeleteEntry(entry.id)}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
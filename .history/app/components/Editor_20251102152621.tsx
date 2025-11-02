"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";
import ComponentPreview from "./ComponentPreview";
import {
  createComponent,
  updateComponent,
  getAllLocalizations,
  createLocalization,
  listComponents,
  getComponent,
  clearComponents,
  updateLocalizationByKey,
  deleteComponent,
} from "../lib/database";
import { useToast } from "../context/ToastContext";

interface GlobalThis {
  crypto: Crypto & {
    randomUUID?: () => string;
  };
}

export default function Editor() {
  const { showToast } = useToast();
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages } = useChat();
  const [currentComponent, setCurrentComponent] = useState<string>("");
  const [currentComponentId, setCurrentComponentId] = useState<string | null>(
    null
  );
  const [saved, setSaved] = useState<Array<{ id: string; name: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const [savedComponentsOpen, setSavedComponentsOpen] =
    useState<boolean>(false);
  const examples = [
    "Create a modern button component with hover effects",
    "Build a user profile card with avatar and social links",
    "Make a responsive navigation menu",
    "Design a pricing card component",
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      let locale = "en";
      try {
        const stored = localStorage.getItem("current_locale");
        if (stored) locale = stored;
      } catch {}
      const augmented = `${input} (locale: ${locale})`;
      setIsGenerating(true);
      sendMessage({ text: augmented });
      setInput("");
    }
  };

  const handleSaveRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateComponent(id, { name: editName.trim() });
      setEditingId(null);
      setEditName("");
      const items = await listComponents();
      setSaved(items.map((i) => ({ id: i.id, name: i.name })));
      setTimeout(() => {
        showToast("Component renamed successfully", "success");
      }, 6000);
    } catch (error) {
      showToast("Failed to rename component", "error");
    }
  };

  const handleNewComponent = () => {
    setMessages([]);
    setCurrentComponent("");
    setCurrentComponentId(null);
    processedMessageIds.current.clear();
    setIsGenerating(false);
    showToast("New component session started", "info");
  };

  // Extract React component code from AI responses
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant") {
      // Skip if we've already processed this message
      if (processedMessageIds.current.has(lastMessage.id)) {
        return;
      }
      setIsGenerating(false);
      const text =
        lastMessage.parts.find((part) => part.type === "text")?.text || "";

      // Look for React component code in code blocks
      const codeBlockRegex = /```(?:tsx?|jsx?|react)?\n([\s\S]*?)\n```/g;
      const matches = [...text.matchAll(codeBlockRegex)];

      if (matches.length > 0) {
        // Get the last code block (most recent component)
        const componentCode = matches[matches.length - 1][1];
        if (
          componentCode.includes("export default") ||
          componentCode.includes("function") ||
          componentCode.includes("const")
        ) {
          // Mark this message as processed
          processedMessageIds.current.add(lastMessage.id);
          // Persist to components store FIRST, then update preview
          const ensureId = async () => {
            let id = currentComponentId;
            const derivedName = deriveComponentName(componentCode);
            try {
              if (!id) {
                id = globalThis.crypto?.randomUUID()
                  ? crypto.randomUUID()
                  : `${Date.now()}`;
                setCurrentComponentId(id);
                await createComponent({
                  id,
                  name: derivedName,
                  code: componentCode,
                  session_id: "default",
                });
              } else {
                // Also refresh name if it looks generic or changed
                await updateComponent(id, {
                  code: componentCode,
                  name: derivedName,
                });
              }
              // Refresh saved components list to show new/updated component
              const items = await listComponents();
              setSaved(items.map((i) => ({ id: i.id, name: i.name })));
              // Extract user-visible strings and ensure localization keys exist (with auto-translation)
              await ensureLocalizationsForCode(componentCode);
              // NOW set component state so preview rewrites with complete key set
              setCurrentComponent(componentCode);
              setTimeout(() => {
                showToast("Component generated successfully", "success");
              }, 2000);
            } catch (error) {
              console.error("Failed to save/update component:", error);
            }
          };
          ensureId();
        }
      }
    }
  }, [messages, currentComponentId]);

  // Load saved components list
  useEffect(() => {
    const load = async () => {
      const items = await listComponents();
      setSaved(items.map((i) => ({ id: i.id, name: i.name })));
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "localizations_db") load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function ensureLocalizationsForCode(code: string) {
    const existing = await getAllLocalizations();
    const enToKey = new Map(existing.map((e) => [e.en.trim(), e.key]));
    // Case-insensitive map to improve matching (e.g., "home" vs "Home")
    const enLowerToKey = new Map(
      existing.map((e) => [e.en.trim().toLowerCase(), e.key])
    );
    // Domain-specific aliases (common nav labels)
    const aliasToKey: Record<string, string> = {
      home: "navigation.home",
      about: "navigation.about",
      services: "navigation.services",
      contact: "navigation.contact",
    };

    const candidates = new Set<string>();
    // Find quoted string literals likely to be UI text (including $ and / for prices)
    const quoteRegex = /['"][A-Za-z0-9 ,.!?:;\-\$\/]{2,80}['"]/g;
    let m: RegExpExecArray | null;
    while ((m = quoteRegex.exec(code)) !== null) {
      const raw = m[0];
      const txt = raw.slice(1, -1).trim();
      const idx = m.index;
      const lineStart = code.lastIndexOf("\n", idx) + 1;
      const lineEnd = code.indexOf("\n", idx);
      const line = code.slice(
        lineStart,
        lineEnd === -1 ? code.length : lineEnd
      );
      const lower = txt.toLowerCase();
      const isImportLine = /\bimport\b/.test(line) || /\bfrom\b/.test(line);
      const banned = new Set(["react", "use client"]);
      // Less aggressive filtering: only skip lines that are definitely code (not UI text)
      const isCodeLine =
        /\b(className|href)=/.test(line) ||
        /\bhttp\b/.test(line) ||
        /\bexport\s+(default\s+)?function/.test(line) ||
        /return\s+\{/.test(line);
      if (
        txt.length >= 2 &&
        /[A-Za-z]/.test(txt) &&
        !isCodeLine &&
        !isImportLine &&
        !banned.has(lower)
      ) {
        candidates.add(txt);
      }
    }

    // Collect new keys to create
    const newKeys: Array<{ key: string; en: string }> = [];

    for (const text of candidates) {
      const lower = text.toLowerCase();
      // Preferred: known aliases
      let mappedKey = aliasToKey[lower];
      // Next: exact match
      if (!mappedKey && enToKey.has(text)) mappedKey = enToKey.get(text)!;
      // Next: case-insensitive match
      if (!mappedKey && enLowerToKey.has(lower))
        mappedKey = enLowerToKey.get(lower)!;

      if (mappedKey) {
        // Ensure we at least have an English value for backfill if missing
        if (!enToKey.has(text)) {
          enToKey.set(text, mappedKey);
        }
        continue; // No need to create a new key
      }

      // Create new key if no mapping found
      const key = generateKeyFromText(text);
      // avoid UNIQUE key collision by suffixing if necessary
      let finalKey = key;
      let i = 1;
      while (existing.find((e) => e.key === finalKey)) {
        i += 1;
        finalKey = `${key}.${i}`;
      }
      newKeys.push({ key: finalKey, en: text });
      await createLocalization({
        id: (globalThis as unknown as GlobalThis).crypto?.randomUUID()
          ? crypto.randomUUID()
          : `${Date.now()}${Math.random()}`,
        key: finalKey,
        en: text,
        es: "",
        fr: "",
        de: "",
        ja: "",
        zh: "",
      });
      existing.push({
        id: "",
        key: finalKey,
        en: text,
        es: "",
        fr: "",
        de: "",
        ja: "",
        zh: "",
      });
      enToKey.set(text, finalKey);
    }

    // 2) Ensure keys explicitly referenced via t('key') or __i18n('key') also exist
    const keyRegex = /(?:t|__i18n)\(\s*['"]([a-zA-Z0-9_.-]+)['"]\s*\)/g;
    let km: RegExpExecArray | null;
    while ((km = keyRegex.exec(code)) !== null) {
      const key = km[1];
      if (!existing.find((e) => e.key === key)) {
        const enFromKey = key
          .split(".")
          .slice(-1)[0]
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        newKeys.push({ key, en: enFromKey });
        await createLocalization({
          id: (globalThis as unknown as GlobalThis).crypto?.randomUUID()
            ? crypto.randomUUID()
            : `${Date.now()}${Math.random()}`,
          key,
          en: enFromKey,
          es: "",
          fr: "",
          de: "",
          ja: "",
          zh: "",
        });
        existing.push({
          id: "",
          key,
          en: enFromKey,
          es: "",
          fr: "",
          de: "",
          ja: "",
          zh: "",
        });
      }
    }

    // 3) Translate all new keys in batch
    if (newKeys.length > 0) {
      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ translations: newKeys }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Translation API error:", response.status, errorText);
          throw new Error(`Translation API returned ${response.status}`);
        }

        const data = await response.json();
        if (data.translations && typeof data.translations === "object") {
          // Update each translation key
          for (const item of newKeys) {
            const trans = data.translations;
            const updates: {
              es?: string;
              fr?: string;
              de?: string;
              ja?: string;
              zh?: string;
            } = {};

            // Only update if translation exists and is not empty
            if (trans.es?.[item.en]) updates.es = trans.es[item.en];
            if (trans.fr?.[item.en]) updates.fr = trans.fr[item.en];
            if (trans.de?.[item.en]) updates.de = trans.de[item.en];
            if (trans.ja?.[item.en]) updates.ja = trans.ja[item.en];
            if (trans.zh?.[item.en]) updates.zh = trans.zh[item.en];

            // Only update if we have at least one translation
            if (Object.keys(updates).length > 0) {
              await updateLocalizationByKey(item.key, updates);
            }
          }
          console.log(`Auto-translated ${newKeys.length} keys successfully`);

          // Trigger refresh for LocalizationTable and ComponentPreview
          try {
            localStorage.setItem(
              "localizations_db_version",
              Date.now().toString()
            );
            // Also dispatch a custom event for LocalizationTable
            window.dispatchEvent(new Event("localizations-updated"));
          } catch {}
        } else {
          console.warn("Translation API returned unexpected format:", data);
        }
      } catch (error) {
        console.error("Failed to auto-translate:", error);
        // Show toast but don't block - user can still manually translate
        showToast(
          "Auto-translation failed. Translations can be added manually.",
          "warning"
        );
      }
    }
  }

  function generateKeyFromText(text: string): string {
    const base = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    return `auto.${base.slice(0, 40)}`;
  }

  function deriveComponentName(code: string): string {
    // Try several patterns from most explicit to least
    const patterns = [
      /export\s+default\s+function\s+([A-Za-z0-9_]+)/,
      /function\s+([A-Za-z0-9_]+)\s*\(/,
      /const\s+([A-Za-z0-9_]+)\s*=\s*\(/,
      /export\s+default\s+([A-Za-z0-9_]+)/,
    ];
    for (const re of patterns) {
      const m = re.exec(code);
      if (m && m[1]) return m[1];
    }
    // Fallback: Button, Card, Form keywords
    if (/button/i.test(code)) return "Button";
    if (/card/i.test(code)) return "Card";
    if (/form/i.test(code)) return "Form";
    return "Component";
  }

  return (
    <div className="flex h-full">
      {/* Chat Section */}
      <div className="w-1/2 flex flex-col relative">
        {/* Scrollable Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 pb-32">
          <div className="max-w-2xl mx-auto">
            <div className="mb-6 app-surface p-5 soft-shadow">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                    React Component Creator
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Describe the component and I&apos;ll generate it with a live
                    preview.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleNewComponent}
                    className="text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                    title="Start new component"
                  >
                    <span className="flex items-center gap-1.5">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      New Component
                    </span>
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setSavedComponentsOpen(!savedComponentsOpen)
                      }
                      className="text-xs px-4 py-2 rounded-lg bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-medium transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
                    >
                      <svg
                        className="w-3.5 h-3.5 text-blue-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                        />
                      </svg>
                      <span>Saved ({saved.length})</span>
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${
                          savedComponentsOpen ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>

                    {savedComponentsOpen && (
                      <>
                        <div className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-96 overflow-y-auto min-w-[300px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                          {saved.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                              <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                <svg
                                  className="w-6 h-6 text-gray-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                                  />
                                </svg>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                No saved components yet
                              </p>
                            </div>
                          ) : (
                            <>
                              {saved.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-center justify-between px-4 py-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent dark:hover:from-blue-900/20 dark:hover:to-transparent border-b border-gray-100 dark:border-gray-700 last:border-b-0 group transition-all duration-150 cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {editingId === s.id ? (
                                      <>
                                        <input
                                          type="text"
                                          value={editName}
                                          onChange={(e) =>
                                            setEditName(e.target.value)
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              handleSaveRename(s.id);
                                            } else if (e.key === "Escape") {
                                              setEditingId(null);
                                              setEditName("");
                                            }
                                          }}
                                          className="flex-1 text-xs bg-transparent border border-blue-500 dark:border-blue-400 outline-none px-2 py-1 rounded text-gray-700 dark:text-gray-200"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() => handleSaveRename(s.id)}
                                          className="text-green-500 hover:text-green-600"
                                          title="Save"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingId(null);
                                            setEditName("");
                                          }}
                                          className="text-red-500 hover:text-red-600"
                                          title="Cancel"
                                        >
                                          ✕
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          onClick={async () => {
                                            const rec = await getComponent(
                                              s.id
                                            );
                                            if (rec) {
                                              setCurrentComponentId(s.id);
                                              setCurrentComponent(rec.code);
                                              setSavedComponentsOpen(false);
                                              showToast(
                                                `Loaded ${s.name}`,
                                                "info"
                                              );
                                            }
                                          }}
                                          className="flex-1 text-xs text-left text-gray-700 dark:text-gray-200 hover:text-blue-600 font-medium truncate"
                                          title={`Click to load ${s.name}`}
                                        >
                                          {s.name}
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingId(s.id);
                                            setEditName(s.name);
                                          }}
                                          className="text-gray-400 hover:text-gray-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                          title="Rename"
                                        >
                                          ✎
                                        </button>
                                        <button
                                          onClick={async () => {
                                            if (
                                              confirm(`Delete "${s.name}"?`)
                                            ) {
                                              try {
                                                await deleteComponent(s.id);
                                                const items =
                                                  await listComponents();
                                                setSaved(
                                                  items.map((i) => ({
                                                    id: i.id,
                                                    name: i.name,
                                                  }))
                                                );
                                                if (
                                                  currentComponentId === s.id
                                                ) {
                                                  setCurrentComponent("");
                                                  setCurrentComponentId(null);
                                                }
                                                showToast(
                                                  "Component deleted successfully",
                                                  "success"
                                                );
                                                if (items.length === 1) {
                                                  setSavedComponentsOpen(false);
                                                }
                                              } catch (error) {
                                                showToast(
                                                  "Failed to delete component",
                                                  "error"
                                                );
                                              }
                                            }
                                          }}
                                          className="text-gray-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                          title="Delete"
                                        >
                                          ✕
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (
                                      confirm("Clear all saved components?")
                                    ) {
                                      try {
                                        await clearComponents();
                                        const items = await listComponents();
                                        setSaved(
                                          items.map((i) => ({
                                            id: i.id,
                                            name: i.name,
                                          }))
                                        );
                                        setCurrentComponent("");
                                        setCurrentComponentId(null);
                                        setSavedComponentsOpen(false);
                                        showToast(
                                          "All components cleared successfully",
                                          "success"
                                        );
                                      } catch (error) {
                                        showToast(
                                          "Failed to clear components",
                                          "error"
                                        );
                                      }
                                    }
                                  }}
                                  className="w-full text-xs px-3 py-2 rounded-md bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-800 text-red-700 dark:text-red-300 transition-colors"
                                >
                                  Clear All
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setSavedComponentsOpen(false)}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {messages.length === 0 && (
              <div className="app-surface soft-shadow rounded-lg p-5 mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Try these examples
                </h3>
                <div className="flex flex-wrap gap-2">
                  {examples.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setInput(e);
                        // auto-send
                        sendMessage({ text: e });
                      }}
                      className="px-3 py-1.5 text-sm rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className="mb-6">
                <div
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-3xl rounded-lg px-4 py-3 ${
                      message.role === "user"
                        ? "bg-blue-500 text-white ml-12"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white mr-12"
                    }`}
                  >
                    <div className="text-sm font-medium mb-1">
                      {message.role === "user" ? "You" : "AI Assistant"}
                    </div>
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case "text":
                          return (
                            <div
                              key={`${message.id}-${i}`}
                              className="whitespace-pre-wrap"
                            >
                              {message.role === "user"
                                ? part.text
                                    .replace(
                                      /\(locale:\s*(en|es|fr|de|ja|zh)\)/i,
                                      ""
                                    )
                                    .trim()
                                : part.text}
                            </div>
                          );
                      }
                    })}
                  </div>
                </div>
              </div>
            ))}

            {isGenerating && (
              <div className="mb-6">
                <div className="flex justify-start">
                  <div className="max-w-3xl rounded-lg px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white mr-12">
                    <div className="text-sm font-medium mb-1">AI Assistant</div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-500">
                        Generating component...
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fixed Chat Input */}
        <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit}>
              <div className="relative flex items-end bg-white/90 dark:bg-zinc-800/90 backdrop-blur border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-200">
                <textarea
                  className="flex-1 px-6 py-4 bg-transparent text-lg placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none resize-none min-h-[56px] max-h-32 overflow-y-auto"
                  value={input}
                  placeholder="Describe the React component you want to create..."
                  onChange={(e) => setInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  rows={1}
                  style={{
                    height: "auto",
                    minHeight: "56px",
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height =
                      Math.min(target.scrollHeight, 128) + "px";
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isGenerating}
                  className="mr-2 mb-2 p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-600 text-white rounded-xl transition-colors duration-200 disabled:cursor-not-allowed flex items-center justify-center min-w-[44px] min-h-[44px]"
                  title={isGenerating ? "Generating component..." : "Send"}
                >
                  {isGenerating ? (
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      <div className="w-1/2 border-l border-gray-200 dark:border-gray-700">
        <ComponentPreview componentCode={currentComponent} />
      </div>
    </div>
  );
}

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = path.join(process.cwd(), "database.db");
let db: Database.Database | null = null;

export interface LocalizationEntry {
  id: string;
  key: string;
  en: string;
  es: string;
  fr: string;
  de: string;
  ja: string;
  zh: string;
  created_at?: string;
  updated_at?: string;
}

export interface ComponentRecord {
  id: string;
  name: string;
  code: string;
  session_id: string;
  created_at?: string;
  updated_at?: string;
}

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(dbPath);

    // Enable foreign keys
    db.pragma("foreign_keys = ON");

    // Create tables if they don't exist
    initializeTables(db);

    // Seed initial data if needed
    seedInitialData(db);
  }
  return db;
}

function initializeTables(database: Database.Database): void {
  // Create localizations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS localizations (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      en TEXT DEFAULT '',
      es TEXT DEFAULT '',
      fr TEXT DEFAULT '',
      de TEXT DEFAULT '',
      ja TEXT DEFAULT '',
      zh TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create components table
  database.exec(`
    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      session_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function seedInitialData(database: Database.Database): void {
  // Check if data already exists
  const count = database
    .prepare("SELECT COUNT(*) as count FROM localizations")
    .get() as { count: number };
  if (count.count > 0) {
    return; // Already seeded
  }

  const initialData = [
    {
      id: "nav-1",
      key: "navigation.home",
      en: "Home",
      es: "Inicio",
      fr: "Accueil",
      de: "Startseite",
      ja: "ホーム",
      zh: "首页",
    },
    {
      id: "nav-2",
      key: "navigation.about",
      en: "About",
      es: "Acerca de",
      fr: "À propos",
      de: "Über uns",
      ja: "概要",
      zh: "关于我们",
    },
    {
      id: "nav-3",
      key: "navigation.services",
      en: "Services",
      es: "Servicios",
      fr: "Services",
      de: "Leistungen",
      ja: "サービス",
      zh: "服务",
    },
    {
      id: "nav-4",
      key: "navigation.contact",
      en: "Contact",
      es: "Contacto",
      fr: "Contact",
      de: "Kontakt",
      ja: "お問い合わせ",
      zh: "联系",
    },
    {
      id: "nav-5",
      key: "navigation.toggleMenu",
      en: "Menu",
      es: "Menú",
      fr: "Menu",
      de: "Menü",
      ja: "メニュー",
      zh: "菜单",
    },
    {
      id: "btn-1",
      key: "button.click_me",
      en: "Click me",
      es: "Haz clic",
      fr: "Cliquez-moi",
      de: "Klick mich",
      ja: "クリックしてください",
      zh: "点击我",
    },
    {
      id: "btn-2",
      key: "button.submit",
      en: "Submit",
      es: "Enviar",
      fr: "Soumettre",
      de: "Senden",
      ja: "送信",
      zh: "提交",
    },
    {
      id: "btn-3",
      key: "button.cancel",
      en: "Cancel",
      es: "Cancelar",
      fr: "Annuler",
      de: "Abbrechen",
      ja: "キャンセル",
      zh: "取消",
    },
    {
      id: "btn-4",
      key: "button.save",
      en: "Save",
      es: "Guardar",
      fr: "Enregistrer",
      de: "Speichern",
      ja: "保存",
      zh: "保存",
    },
    {
      id: "btn-5",
      key: "button.delete",
      en: "Delete",
      es: "Eliminar",
      fr: "Supprimer",
      de: "Löschen",
      ja: "削除",
      zh: "删除",
    },
    {
      id: "btn-6",
      key: "button.edit",
      en: "Edit",
      es: "Editar",
      fr: "Modifier",
      de: "Bearbeiten",
      ja: "編集",
      zh: "编辑",
    },
    {
      id: "btn-7",
      key: "button.back",
      en: "Back",
      es: "Atrás",
      fr: "Retour",
      de: "Zurück",
      ja: "戻る",
      zh: "返回",
    },
    {
      id: "btn-8",
      key: "button.next",
      en: "Next",
      es: "Siguiente",
      fr: "Suivant",
      de: "Weiter",
      ja: "次へ",
      zh: "下一步",
    },
  ];

  const insert = database.prepare(`
    INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = database.transaction((items) => {
    for (const item of items) {
      insert.run(
        item.id,
        item.key,
        item.en,
        item.es,
        item.fr,
        item.de,
        item.ja,
        item.zh
      );
    }
  });

  insertMany(initialData);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

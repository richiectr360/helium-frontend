import initSqlJs, { Database, SqlValue } from "sql.js";

let db: Database | null = null;

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

// Component persistence types
export interface ComponentRecord {
  id: string;
  name: string;
  code: string;
  session_id: string;
  chat_history?: string; // JSON stringified chat messages
  created_at?: string;
  updated_at?: string;
}

// Simple database class for CRUD operations
export class LocalizationDB {
  private static instance: LocalizationDB;

  static getInstance(): LocalizationDB {
    if (!LocalizationDB.instance) {
      LocalizationDB.instance = new LocalizationDB();
    }
    return LocalizationDB.instance;
  }

  async init(): Promise<void> {
    if (db) return;
    await initializeDatabase();
  }

  async getAll(): Promise<LocalizationEntry[]> {
    await this.init();
    return getAllLocalizations();
  }

  async update(id: string, field: string, value: string): Promise<void> {
    await this.init();
    return updateLocalization(id, field, value);
  }

  async create(
    entry: Omit<LocalizationEntry, "created_at" | "updated_at">
  ): Promise<void> {
    await this.init();
    return createLocalization(entry);
  }

  async delete(id: string): Promise<void> {
    await this.init();
    return deleteLocalization(id);
  }

  async getTranslations(locale: string): Promise<Record<string, string>> {
    await this.init();
    return getTranslations(locale);
  }
}

export async function initializeDatabase(): Promise<void> {
  if (db) return; // Already initialized

  try {
    // Initialize SQL.js
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });

    // Try to load existing database from localStorage
    const savedDb = localStorage.getItem("localizations_db");
    if (savedDb) {
      // Handle both old comma-separated format and new base64 format
      let uint8Array: Uint8Array;
      if (savedDb.includes(",")) {
        // Legacy comma-separated format
        uint8Array = new Uint8Array(savedDb.split(",").map(Number));
      } else {
        // New base64 format
        const binaryString = atob(savedDb);
        const binaryArray = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          binaryArray[i] = binaryString.charCodeAt(i);
        }
        uint8Array = binaryArray;
      }
      db = new SQL.Database(uint8Array);
      console.log("Loaded existing database from localStorage");

      // Ensure components table exists for older DBs
      ensureComponentsTable();
      // Ensure essential localization keys exist even for older DBs
      ensureSeedKeys();
    } else {
      // Create new database
      db = new SQL.Database();

      // Create the localization table
      db.run(`
        CREATE TABLE localizations (
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

      // Create the components table
      db.run(`
        CREATE TABLE components (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          code TEXT NOT NULL,
          session_id TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Insert initial data
      await seedInitialData();
      console.log("Created new database with initial data");
    }

    // Save database to localStorage
    saveDatabaseToLocalStorage();
  } catch (error) {
    console.error("Failed to initialize SQLite database:", error);
    throw error;
  }
}

async function seedInitialData(): Promise<void> {
  if (!db) throw new Error("Database not initialized");

  const initialData = [
    {
      id: "1",
      key: "welcome.title",
      en: "Welcome to our app",
      es: "Bienvenido a nuestra aplicación",
      fr: "Bienvenue dans notre application",
      de: "Willkommen in unserer App",
      ja: "私たちのアプリへようこそ",
      zh: "欢迎使用我们的应用",
    },
    {
      id: "2",
      key: "button.submit",
      en: "Submit",
      es: "Enviar",
      fr: "Soumettre",
      de: "Absenden",
      ja: "送信",
      zh: "提交",
    },
    {
      id: "3",
      key: "error.validation",
      en: "Please check your input",
      es: "Por favor verifica tu entrada",
      fr: "Veuillez vérifier votre saisie",
      de: "Bitte überprüfen Sie Ihre Eingabe",
      ja: "入力内容を確認してください",
      zh: "请检查您的输入",
    },
    {
      id: "4",
      key: "navigation.home",
      en: "Home",
      es: "Inicio",
      fr: "Accueil",
      de: "Startseite",
      ja: "ホーム",
      zh: "首页",
    },
    {
      id: "5",
      key: "form.email",
      en: "Email Address",
      es: "Dirección de correo",
      fr: "Adresse e-mail",
      de: "E-Mail-Adresse",
      ja: "メールアドレス",
      zh: "电子邮件地址",
    },
  ];

  // Add common navigation keys so non-English locales work out of the box
  const extraNav = [
    {
      id: "nav-1",
      key: "navigation.about",
      en: "About",
      es: "Acerca de",
      fr: "À propos",
      de: "Über uns",
      ja: "概要",
      zh: "关于我们",
    },
    {
      id: "nav-2",
      key: "navigation.services",
      en: "Services",
      es: "Servicios",
      fr: "Services",
      de: "Leistungen",
      ja: "サービス",
      zh: "服务",
    },
    {
      id: "nav-3",
      key: "navigation.contact",
      en: "Contact",
      es: "Contacto",
      fr: "Contact",
      de: "Kontakt",
      ja: "お問い合わせ",
      zh: "联系",
    },
  ];

  const extraButtons = [
    {
      id: "btn-1",
      key: "button.select_plan",
      en: "Select plan",
      es: "Seleccionar plan",
      fr: "Choisir le forfait",
      de: "Tarif wählen",
      ja: "プランを選択",
      zh: "选择方案",
    },
    {
      id: "btn-2",
      key: "button.follow",
      en: "Follow",
      es: "Seguir",
      fr: "Suivre",
      de: "Folgen",
      ja: "フォロー",
      zh: "关注",
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

  const extraProfile = [
    {
      id: "prof-1",
      key: "profile.title",
      en: "Profile Title",
      es: "Título del perfil",
      fr: "Titre du profil",
      de: "Profil Titel",
      ja: "プロフィールのタイトル",
      zh: "个人资料标题",
    },
    {
      id: "prof-2",
      key: "profile.description",
      en: "Profile description",
      es: "Descripción del perfil",
      fr: "Description du profil",
      de: "Profilbeschreibung",
      ja: "プロフィールの説明",
      zh: "个人资料描述",
    },
    {
      id: "prof-3",
      key: "profile.name",
      en: "Profile Name",
      es: "Nombre del perfil",
      fr: "Nom du profil",
      de: "Profilname",
      ja: "プロフィール名",
      zh: "个人资料名称",
    },
  ];

  const extraForms = [
    {
      id: "form-1",
      key: "form.password",
      en: "Password",
      es: "Contraseña",
      fr: "Mot de passe",
      de: "Passwort",
      ja: "パスワード",
      zh: "密码",
    },
    {
      id: "form-2",
      key: "form.name",
      en: "Name",
      es: "Nombre",
      fr: "Nom",
      de: "Name",
      ja: "名前",
      zh: "姓名",
    },
    {
      id: "form-3",
      key: "form.search",
      en: "Search",
      es: "Buscar",
      fr: "Rechercher",
      de: "Suchen",
      ja: "検索",
      zh: "搜索",
    },
    {
      id: "form-4",
      key: "form.select",
      en: "Select",
      es: "Seleccionar",
      fr: "Sélectionner",
      de: "Auswählen",
      ja: "選択",
      zh: "选择",
    },
    {
      id: "form-5",
      key: "form.placeholder",
      en: "Enter text here...",
      es: "Ingrese texto aquí...",
      fr: "Entrez le texte ici...",
      de: "Text hier eingeben...",
      ja: "ここにテキストを入力...",
      zh: "在此输入文本...",
    },
  ];

  const demoKeys = [
    {
      id: "demo-1",
      key: "demo.text",
      en: "Demo text",
      es: "Texto de demostración",
      fr: "Texte de démonstration",
      de: "Demo-Text",
      ja: "デモテキスト",
      zh: "演示文本",
    },
    {
      id: "demo-2",
      key: "demo.name",
      en: "Demo Name",
      es: "Nombre de demostración",
      fr: "Nom de démonstration",
      de: "Demo-Name",
      ja: "デモ名",
      zh: "演示名称",
    },
    {
      id: "demo-3",
      key: "demo.value",
      en: "Demo Value",
      es: "Valor de demostración",
      fr: "Valeur de démonstration",
      de: "Demo-Wert",
      ja: "デモ値",
      zh: "演示值",
    },
  ];

  const extraCommon = [
    {
      id: "common-1",
      key: "common.loading",
      en: "Loading...",
      es: "Cargando...",
      fr: "Chargement...",
      de: "Laden...",
      ja: "読み込み中...",
      zh: "加载中...",
    },
    {
      id: "common-2",
      key: "common.error",
      en: "Error",
      es: "Error",
      fr: "Erreur",
      de: "Fehler",
      ja: "エラー",
      zh: "错误",
    },
    {
      id: "common-3",
      key: "common.success",
      en: "Success",
      es: "Éxito",
      fr: "Succès",
      de: "Erfolg",
      ja: "成功",
      zh: "成功",
    },
    {
      id: "common-4",
      key: "common.dashboard",
      en: "Dashboard",
      es: "Panel de control",
      fr: "Tableau de bord",
      de: "Dashboard",
      ja: "ダッシュボード",
      zh: "仪表板",
    },
    {
      id: "common-5",
      key: "common.settings",
      en: "Settings",
      es: "Configuración",
      fr: "Paramètres",
      de: "Einstellungen",
      ja: "設定",
      zh: "设置",
    },
    {
      id: "common-6",
      key: "common.logout",
      en: "Logout",
      es: "Cerrar sesión",
      fr: "Déconnexion",
      de: "Abmelden",
      ja: "ログアウト",
      zh: "登出",
    },
    {
      id: "common-7",
      key: "common.login",
      en: "Login",
      es: "Iniciar sesión",
      fr: "Connexion",
      de: "Anmelden",
      ja: "ログイン",
      zh: "登录",
    },
  ];

  for (const entry of initialData) {
    db.run(
      `
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.key,
        entry.en,
        entry.es,
        entry.fr,
        entry.de,
        entry.ja,
        entry.zh,
      ]
    );
  }

  for (const entry of extraNav) {
    db.run(
      `
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.key,
        entry.en,
        entry.es,
        entry.fr,
        entry.de,
        entry.ja,
        entry.zh,
      ]
    );
  }

  for (const entry of extraButtons) {
    db.run(
      `
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.key,
        entry.en,
        entry.es,
        entry.fr,
        entry.de,
        entry.ja,
        entry.zh,
      ]
    );
  }
  for (const entry of extraProfile) {
    db.run(
      `
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.key,
        entry.en,
        entry.es,
        entry.fr,
        entry.de,
        entry.ja,
        entry.zh,
      ]
    );
  }

  for (const entry of extraForms) {
    db.run(
      `
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.key,
        entry.en,
        entry.es,
        entry.fr,
        entry.de,
        entry.ja,
        entry.zh,
      ]
    );
  }

  for (const entry of extraCommon) {
    db.run(
      `
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.key,
        entry.en,
        entry.es,
        entry.fr,
        entry.de,
        entry.ja,
        entry.zh,
      ]
    );
  }

  for (const entry of demoKeys) {
    db.run(
      `
      INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        entry.id,
        entry.key,
        entry.en,
        entry.es,
        entry.fr,
        entry.de,
        entry.ja,
        entry.zh,
      ]
    );
  }
}

function ensureComponentsTable(): void {
  if (!db) return;
  try {
    const res = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='components'"
    );
    const exists = res.length > 0 && res[0].values.length > 0;
    if (!exists) {
      db.run(`
        CREATE TABLE components (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          code TEXT NOT NULL,
          session_id TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      saveDatabaseToLocalStorage();
    }
  } catch (e) {
    console.error("Failed to ensure components table:", e);
  }
}

function ensureSeedKeys(): void {
  if (!db) return;
  const rows = db.exec("SELECT key FROM localizations");
  const have = new Set<string>(
    (rows[0]?.values || []).map((v) => v[0] as string)
  );
  const ensure = (
    key: string,
    values: {
      en: string;
      es: string;
      fr: string;
      de: string;
      ja: string;
      zh: string;
    }
  ) => {
    if (!have.has(key)) {
      db!.run(
        `
        INSERT INTO localizations (id, key, en, es, fr, de, ja, zh)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          cryptoRandomId(),
          key,
          values.en,
          values.es,
          values.fr,
          values.de,
          values.ja,
          values.zh,
        ]
      );
    }
  };
  // essential keys
  ensure("navigation.home", {
    en: "Home",
    es: "Inicio",
    fr: "Accueil",
    de: "Startseite",
    ja: "ホーム",
    zh: "首页",
  });
  ensure("navigation.about", {
    en: "About",
    es: "Acerca de",
    fr: "À propos",
    de: "Über uns",
    ja: "概要",
    zh: "关于我们",
  });
  ensure("navigation.services", {
    en: "Services",
    es: "Servicios",
    fr: "Services",
    de: "Leistungen",
    ja: "サービス",
    zh: "服务",
  });
  ensure("navigation.contact", {
    en: "Contact",
    es: "Contacto",
    fr: "Contact",
    de: "Kontakt",
    ja: "お問い合わせ",
    zh: "联系",
  });
  ensure("navigation.toggleMenu", {
    en: "Menu",
    es: "Menú",
    fr: "Menu",
    de: "Menü",
    ja: "メニュー",
    zh: "菜单",
  });
  ensure("button.select_plan", {
    en: "Select plan",
    es: "Seleccionar plan",
    fr: "Choisir le forfait",
    de: "Tarif wählen",
    ja: "プランを選択",
    zh: "选择方案",
  });
  ensure("button.follow", {
    en: "Follow",
    es: "Seguir",
    fr: "Suivre",
    de: "Folgen",
    ja: "フォロー",
    zh: "关注",
  });
  ensure("button.click_me", {
    en: "Click me",
    es: "Haz clic",
    fr: "Cliquez-moi",
    de: "Klick mich",
    ja: "クリックしてください",
    zh: "点击我",
  });
  ensure("button.cancel", {
    en: "Cancel",
    es: "Cancelar",
    fr: "Annuler",
    de: "Abbrechen",
    ja: "キャンセル",
    zh: "取消",
  });
  ensure("button.save", {
    en: "Save",
    es: "Guardar",
    fr: "Enregistrer",
    de: "Speichern",
    ja: "保存",
    zh: "保存",
  });
  ensure("button.delete", {
    en: "Delete",
    es: "Eliminar",
    fr: "Supprimer",
    de: "Löschen",
    ja: "削除",
    zh: "删除",
  });
  ensure("button.edit", {
    en: "Edit",
    es: "Editar",
    fr: "Modifier",
    de: "Bearbeiten",
    ja: "編集",
    zh: "编辑",
  });
  ensure("button.back", {
    en: "Back",
    es: "Atrás",
    fr: "Retour",
    de: "Zurück",
    ja: "戻る",
    zh: "返回",
  });
  ensure("button.next", {
    en: "Next",
    es: "Siguiente",
    fr: "Suivant",
    de: "Weiter",
    ja: "次へ",
    zh: "下一步",
  });
  ensure("profile.title", {
    en: "Profile Title",
    es: "Título del perfil",
    fr: "Titre du profil",
    de: "Profil Titel",
    ja: "プロフィールのタイトル",
    zh: "个人资料标题",
  });
  ensure("profile.description", {
    en: "Profile description",
    es: "Descripción del perfil",
    fr: "Description du profil",
    de: "Profilbeschreibung",
    ja: "プロフィールの説明",
    zh: "个人资料描述",
  });
  ensure("profile.name", {
    en: "Profile Name",
    es: "Nombre del perfil",
    fr: "Nom du profil",
    de: "Profilname",
    ja: "プロフィール名",
    zh: "个人资料名称",
  });
  // Social navigation keys (AI sometimes generates these)
  ensure("social.home", {
    en: "Home",
    es: "Inicio",
    fr: "Accueil",
    de: "Startseite",
    ja: "ホーム",
    zh: "首页",
  });
  ensure("social.about", {
    en: "About",
    es: "Acerca de",
    fr: "À propos",
    de: "Über uns",
    ja: "概要",
    zh: "关于我们",
  });
  ensure("social.services", {
    en: "Services",
    es: "Servicios",
    fr: "Services",
    de: "Leistungen",
    ja: "サービス",
    zh: "服务",
  });
  ensure("social.contact", {
    en: "Contact",
    es: "Contacto",
    fr: "Contact",
    de: "Kontakt",
    ja: "お問い合わせ",
    zh: "联系",
  });
  // Pricing card keys
  ensure("pricing.title", {
    en: "Pricing Card",
    es: "Tarjeta de Precios",
    fr: "Carte de Prix",
    de: "Preiskarte",
    ja: "価格カード",
    zh: "价格卡",
  });
  ensure("pricing.description", {
    en: "Perfect for your needs",
    es: "Perfecto para tus necesidades",
    fr: "Parfait pour vos besoins",
    de: "Perfekt für Ihre Bedürfnisse",
    ja: "あなたのニーズに最適",
    zh: "满足您的需求",
  });
  ensure("pricing.price", {
    en: "$29/mo",
    es: "$29/mes",
    fr: "$29/mois",
    de: "$29/Monat",
    ja: "$29/月",
    zh: "$29/月",
  });
  // Form keys
  ensure("form.password", {
    en: "Password",
    es: "Contraseña",
    fr: "Mot de passe",
    de: "Passwort",
    ja: "パスワード",
    zh: "密码",
  });
  ensure("form.name", {
    en: "Name",
    es: "Nombre",
    fr: "Nom",
    de: "Name",
    ja: "名前",
    zh: "姓名",
  });
  ensure("form.search", {
    en: "Search",
    es: "Buscar",
    fr: "Rechercher",
    de: "Suchen",
    ja: "検索",
    zh: "搜索",
  });
  ensure("form.select", {
    en: "Select",
    es: "Seleccionar",
    fr: "Sélectionner",
    de: "Auswählen",
    ja: "選択",
    zh: "选择",
  });
  ensure("form.placeholder", {
    en: "Enter text here...",
    es: "Ingrese texto aquí...",
    fr: "Entrez le texte ici...",
    de: "Text hier eingeben...",
    ja: "ここにテキストを入力...",
    zh: "在此输入文本...",
  });
  // Demo keys
  ensure("demo.text", {
    en: "Demo text",
    es: "Texto de demostración",
    fr: "Texte de démonstration",
    de: "Demo-Text",
    ja: "デモテキスト",
    zh: "演示文本",
  });
  ensure("demo.name", {
    en: "Demo Name",
    es: "Nombre de demostración",
    fr: "Nom de démonstration",
    de: "Demo-Name",
    ja: "デモ名",
    zh: "演示名称",
  });
  ensure("demo.value", {
    en: "Demo Value",
    es: "Valor de demostración",
    fr: "Valeur de démonstration",
    de: "Demo-Wert",
    ja: "デモ値",
    zh: "演示值",
  });
  // Common UI keys
  ensure("common.loading", {
    en: "Loading...",
    es: "Cargando...",
    fr: "Chargement...",
    de: "Laden...",
    ja: "読み込み中...",
    zh: "加载中...",
  });
  ensure("common.error", {
    en: "Error",
    es: "Error",
    fr: "Erreur",
    de: "Fehler",
    ja: "エラー",
    zh: "错误",
  });
  ensure("common.success", {
    en: "Success",
    es: "Éxito",
    fr: "Succès",
    de: "Erfolg",
    ja: "成功",
    zh: "成功",
  });
  ensure("common.dashboard", {
    en: "Dashboard",
    es: "Panel de control",
    fr: "Tableau de bord",
    de: "Dashboard",
    ja: "ダッシュボード",
    zh: "仪表板",
  });
  ensure("common.settings", {
    en: "Settings",
    es: "Configuración",
    fr: "Paramètres",
    de: "Einstellungen",
    ja: "設定",
    zh: "设置",
  });
  ensure("common.logout", {
    en: "Logout",
    es: "Cerrar sesión",
    fr: "Déconnexion",
    de: "Abmelden",
    ja: "ログアウト",
    zh: "登出",
  });
  ensure("common.login", {
    en: "Login",
    es: "Iniciar sesión",
    fr: "Connexion",
    de: "Anmelden",
    ja: "ログイン",
    zh: "登录",
  });
  saveDatabaseToLocalStorage();
}

function cryptoRandomId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now()}${Math.random()}`;
}

function saveDatabaseToLocalStorage(): void {
  if (!db) return;

  try {
    const data = db.export();
    const binaryString = String.fromCharCode.apply(null, Array.from(data));
    const base64String = btoa(binaryString);
    localStorage.setItem("localizations_db", base64String);
  } catch (error) {
    console.error("Failed to save database to localStorage:", error);
  }
}

export async function getAllLocalizations(): Promise<LocalizationEntry[]> {
  if (!db) {
    await initializeDatabase();
  }

  const result = db!.exec("SELECT * FROM localizations ORDER BY key");
  if (result.length === 0) return [];

  return result[0].values.map((row) => ({
    id: row[0] as string,
    key: row[1] as string,
    en: row[2] as string,
    es: row[3] as string,
    fr: row[4] as string,
    de: row[5] as string,
    ja: row[6] as string,
    zh: row[7] as string,
    created_at: row[8] as string,
    updated_at: row[9] as string,
  }));
}

// Components CRUD
export async function createComponent(
  rec: Omit<ComponentRecord, "created_at" | "updated_at">
): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }
  db!.run(
    `INSERT INTO components (id, name, code, session_id) VALUES (?, ?, ?, ?)`,
    [rec.id, rec.name, rec.code, rec.session_id ?? ""]
  );
  saveDatabaseToLocalStorage();
}

export async function updateComponent(
  id: string,
  fields: Partial<Pick<ComponentRecord, "name" | "code" | "session_id">>
): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }
  const sets: string[] = [];
  const values: Array<string> = [];
  if (fields.name !== undefined) {
    sets.push("name = ?");
    values.push(fields.name);
  }
  if (fields.code !== undefined) {
    sets.push("code = ?");
    values.push(fields.code);
  }
  if (fields.session_id !== undefined) {
    sets.push("session_id = ?");
    values.push(fields.session_id);
  }
  if (sets.length === 0) return;
  const sql = `UPDATE components SET ${sets.join(
    ", "
  )}, updated_at = datetime('now') WHERE id = ?`;
  values.push(id);
  db!.run(sql, values);
  saveDatabaseToLocalStorage();
}

export async function deleteComponent(id: string): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }
  db!.run("DELETE FROM components WHERE id = ?", [id]);
  saveDatabaseToLocalStorage();
}

export async function getComponent(
  id: string
): Promise<ComponentRecord | null> {
  if (!db) {
    await initializeDatabase();
  }
  const result = db!.exec("SELECT * FROM components WHERE id = ?", [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const r = result[0].values[0];
  return {
    id: r[0] as string,
    name: r[1] as string,
    code: r[2] as string,
    session_id: r[3] as string,
    created_at: r[4] as string,
    updated_at: r[5] as string,
  };
}

export async function listComponents(): Promise<ComponentRecord[]> {
  if (!db) {
    await initializeDatabase();
  }
  const result = db!.exec("SELECT * FROM components ORDER BY updated_at DESC");
  if (result.length === 0) return [];
  return result[0].values.map((row) => ({
    id: row[0] as string,
    name: row[1] as string,
    code: row[2] as string,
    session_id: row[3] as string,
    created_at: row[4] as string,
    updated_at: row[5] as string,
  }));
}

// Clear all saved components (keeps schema and localization data intact)
export async function clearComponents(): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }
  db!.run("DELETE FROM components");
  saveDatabaseToLocalStorage();
}

export async function updateLocalization(
  id: string,
  field: string,
  value: string
): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  // Validate field to prevent SQL injection
  const validFields = ["key", "en", "es", "fr", "de", "ja", "zh"];
  if (!validFields.includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }

  db!.run(
    `
    UPDATE localizations 
    SET ${field} = ?, updated_at = datetime('now')
    WHERE id = ?
  `,
    [value, id]
  );

  saveDatabaseToLocalStorage();
}

export async function updateLocalizationByKey(
  key: string,
  translations: {
    es?: string;
    fr?: string;
    de?: string;
    ja?: string;
    zh?: string;
  }
): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (translations.es !== undefined) {
    updates.push("es = ?");
    values.push(translations.es);
  }
  if (translations.fr !== undefined) {
    updates.push("fr = ?");
    values.push(translations.fr);
  }
  if (translations.de !== undefined) {
    updates.push("de = ?");
    values.push(translations.de);
  }
  if (translations.ja !== undefined) {
    updates.push("ja = ?");
    values.push(translations.ja);
  }
  if (translations.zh !== undefined) {
    updates.push("zh = ?");
    values.push(translations.zh);
  }

  if (updates.length === 0) return; // Nothing to update

  values.push(key); // WHERE key = ?

  db!.run(
    `
    UPDATE localizations 
    SET ${updates.join(", ")}, updated_at = datetime('now')
    WHERE key = ?
  `,
    values as SqlValue[]
  );

  saveDatabaseToLocalStorage();
}

export async function createLocalization(
  entry: Omit<LocalizationEntry, "created_at" | "updated_at">
): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  // Idempotent insert to avoid duplicate-key races
  db!.run(
    `
    INSERT OR IGNORE INTO localizations (id, key, en, es, fr, de, ja, zh)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      entry.id,
      entry.key,
      entry.en,
      entry.es,
      entry.fr,
      entry.de,
      entry.ja,
      entry.zh,
    ]
  );

  saveDatabaseToLocalStorage();
}

export async function deleteLocalization(id: string): Promise<void> {
  if (!db) {
    await initializeDatabase();
  }

  db!.run("DELETE FROM localizations WHERE id = ?", [id]);
  saveDatabaseToLocalStorage();
}

export async function getTranslations(
  locale: string
): Promise<Record<string, string>> {
  if (!db) {
    await initializeDatabase();
  }

  // Validate locale to prevent SQL injection
  const validLocales = ["en", "es", "fr", "de", "ja", "zh"];
  if (!validLocales.includes(locale)) {
    throw new Error(`Invalid locale: ${locale}`);
  }

  const result = db!.exec(
    `SELECT key, ${locale} as translation FROM localizations`
  );
  if (result.length === 0) return {};

  return result[0].values.reduce((acc, row) => {
    acc[row[0] as string] = (row[1] as string) || "";
    return acc;
  }, {} as Record<string, string>);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

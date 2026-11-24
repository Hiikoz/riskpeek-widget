// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: chart-line;

// =====================================================================
//  RiskPeek free widget: MT5 P&L and risk on the iPhone lock screen
//  https://riskpeek.netlify.app
// =====================================================================
//  Sizes:
//   - Lock screen : rectangular, circular, inline
//   - Home screen : small, medium, large
//
//  Run the script once in the Scriptable app: it asks where the numbers
//  come from (MT5 direct via Upstash, or Myfxbook) and stores the
//  settings in the iOS keychain. Nothing to edit here.
//
//  Widget parameter (optional):
//   - Myfxbook : name or number of the account to show
//   - Upstash  : Redis key name (e.g. "mt5pnl_demo")
// =====================================================================

// ------------------------------ CONFIG -------------------------------
const CONFIG = {
  // "auto"     : MT5 direct (Upstash) if set up in the app, else Myfxbook
  // "myfxbook" : free, iPhone only, but Myfxbook updates slowly
  // "upstash"  : the PnLPusher.mq5 EA sends the data (MT5 on PC/VPS)
  // "metaapi"  : reads through MetaApi.cloud
  backend: "auto",

  upstash: {
    url: "https://YOUR-DB.upstash.io",
    // Use Upstash's "Read-Only" token: the phone only needs to read.
    token: "YOUR_READ_ONLY_TOKEN",
    key: "mt5pnl",
  },

  metaapi: {
    token: "YOUR_METAAPI_TOKEN",
    accountId: "YOUR_ACCOUNT_ID",
    region: "new-york", // your account's region in MetaApi
  },

  // beyond this many minutes, the data is flagged as old (⚠︎)
  staleAfterMin: { myfxbook: 30, upstash: 5, metaapi: 5 },
  refreshAfterSec: 60, // asks iOS to refresh (iOS decides in the end)
  // notification when this % of the daily loss limit is used (needs the EA risk inputs)
  alertAtPct: [50, 80],
};
// ---------------------------------------------------------------------

const WAITLIST_URL = "https://riskpeek.netlify.app";
const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF" };
const CACHE_FILE = "mt5-pnl-cache.json";
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), CACHE_FILE);
const notifPath = fm.joinPath(fm.cacheDirectory(), "mt5-pnl-notif.json");

// ------------------------------ LANGUAGE -----------------------------

const LANG = /^fr/i.test(Device.language()) ? "fr" : "en";
const TEXT = {
  en: {
    locale: "en-US",
    errUrl: (u) => `Invalid URL: "${u}". Expected: https://xxx.upstash.io`,
    errTokenEmpty: "empty token",
    errUnreachable: (u, m) => `server unreachable (${u}): check the URL. Detail: ${m}`,
    errTokenRefused: (c, m) => `token refused (HTTP ${c}): paste the full Read-Only token. Detail: ${m}`,
    errKeyEmpty: (k) => `connected, but key "${k}" is empty: is the EA sending to this database?`,
    errBadData: (k, r) => `unreadable data in "${k}": ${r}`,
    upTitle: "MT5 direct (Upstash)",
    upMsg: "Paste the REST URL and the \"Read-Only\" token of your Upstash database (console.upstash.com › your database › REST API).",
    upTokenField: "Read-Only token",
    connect: "Connect",
    cancel: "Cancel",
    ok: "OK",
    connected: "Connected ✓",
    connectedMsg: (d, age) => `Account ${d.login} · ${d.count} position(s)\nEquity ${d.equity} ${d.currency}\nLast push from MT5: ${age} s ago`,
    connFail: "Connection failed",
    connFailDetail: (u, tk) => `\n\nURL used: ${u}\nToken: ${tk}`,
    tokenDesc: (tk) => (tk ? `${tk.slice(0, 4)}…${tk.slice(-4)} (${tk.length} characters)` : "empty"),
    mfxNoAccount: "no account on Myfxbook",
    mfxOpenScript: "open the script in Scriptable to set it up",
    mfxTitle: "Myfxbook login",
    mfxMsg: "Your Myfxbook credentials (not your MT5 ones). They stay in this iPhone's keychain and are only sent to myfxbook.com.",
    email: "E-mail",
    password: "Password",
    signIn: "Sign in",
    loginRefused: "Login refused",
    noAccTitle: "No account",
    noAccMsg: "First add your MT5 account on myfxbook.com (Portfolio › Add account).",
    whichAcc: "Which account?",
    diagTitle: (b) => `Diagnostic ${b === "upstash" ? "MT5 direct" : "Myfxbook"}`,
    diagCommon: (now, last, runs, err) => `iPhone time: ${now}\nLast widget refresh: ${last}\nRuns counted: ${runs}\nLast error: ${err || "none"}`,
    diagUp: (d, t) => `Account: ${d.login}\nLast push from MT5: ${t}\nPositions: ${d.count} · Equity: ${d.equity} ${d.currency}\n`,
    diagMfx: (acc, parsed) => `Account: ${acc.name} (${acc.accountId})\nRaw Myfxbook date: ${acc.lastUpdateDate}\nParsed: ${parsed}\n`,
    error: "Error",
    copy: "Copy",
    whereFrom: "Where do the numbers come from?",
    optDirect: "MT5 direct (EA + Upstash) · fast",
    optMfx: "Myfxbook · slow",
    source: (b) => `Source: ${b === "upstash" ? "MT5 direct (Upstash)" : "Myfxbook"}`,
    preview: "Widget preview",
    editUp: "Edit the Upstash connection",
    backMfx: "Back to Myfxbook",
    toDirect: "Switch to MT5 direct (Upstash)",
    changeMfx: "Change login / account",
    diag: "Diagnostic",
    waitlist: "No-VPS version: join the waitlist",
    wipe: "Erase everything (sign out)",
    close: "Close",
    pos: "pos",
    day: "Day",
    eq: "Eq",
    dl: "Daily loss left",
    dlShort: "DL",
    dd: "Max DD left",
    left: "left",
    noPosition: "No open position",
    more: (n) => `+${n} more`,
    noData: "no data",
    notifTitle: (p) => `Daily loss: ${p}% used`,
    notifBody: (room, c) => `${room} ${c} left before your daily loss limit.`,
  },
  fr: {
    locale: "fr-FR",
    errUrl: (u) => `URL invalide : « ${u} ». Attendu : https://xxx.upstash.io`,
    errTokenEmpty: "token vide",
    errUnreachable: (u, m) => `serveur injoignable (${u}) : vérifiez l'URL. Détail : ${m}`,
    errTokenRefused: (c, m) => `token refusé (HTTP ${c}) : collez le token Read-Only complet. Détail : ${m}`,
    errKeyEmpty: (k) => `connexion OK, mais la clé « ${k} » est vide : l'EA envoie-t-il bien sur cette base ?`,
    errBadData: (k, r) => `données illisibles dans « ${k} » : ${r}`,
    upTitle: "MT5 direct (Upstash)",
    upMsg: "Collez l'URL REST et le token « Read-Only » de votre base Upstash (console.upstash.com › votre base › REST API).",
    upTokenField: "Token Read-Only",
    connect: "Connecter",
    cancel: "Annuler",
    ok: "OK",
    connected: "Connecté ✓",
    connectedMsg: (d, age) => `Compte ${d.login} · ${d.count} position(s)\nÉquité ${d.equity} ${d.currency}\nDernier envoi de MT5 : il y a ${age} s`,
    connFail: "Connexion impossible",
    connFailDetail: (u, tk) => `\n\nURL utilisée : ${u}\nToken : ${tk}`,
    tokenDesc: (tk) => (tk ? `${tk.slice(0, 4)}…${tk.slice(-4)} (${tk.length} caractères)` : "vide"),
    mfxNoAccount: "aucun compte sur Myfxbook",
    mfxOpenScript: "ouvrez le script dans Scriptable pour le configurer",
    mfxTitle: "Connexion Myfxbook",
    mfxMsg: "Identifiants de votre compte Myfxbook (pas ceux de MT5). Ils restent dans le trousseau de cet iPhone et ne sont envoyés qu'à myfxbook.com.",
    email: "E-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    loginRefused: "Connexion refusée",
    noAccTitle: "Aucun compte",
    noAccMsg: "Ajoutez d'abord votre compte MT5 sur myfxbook.com (Portfolio › Ajouter un compte).",
    whichAcc: "Quel compte suivre ?",
    diagTitle: (b) => `Diagnostic ${b === "upstash" ? "MT5 direct" : "Myfxbook"}`,
    diagCommon: (now, last, runs, err) => `Heure de l'iPhone : ${now}\nDernière actualisation du widget : ${last}\nExécutions comptées : ${runs}\nDernière erreur : ${err || "aucune"}`,
    diagUp: (d, t) => `Compte : ${d.login}\nDernier envoi de MT5 : ${t}\nPositions : ${d.count} · Équité : ${d.equity} ${d.currency}\n`,
    diagMfx: (acc, parsed) => `Compte : ${acc.name} (${acc.accountId})\nDate Myfxbook brute : ${acc.lastUpdateDate}\nInterprétée : ${parsed}\n`,
    error: "Erreur",
    copy: "Copier",
    whereFrom: "D'où viennent les chiffres ?",
    optDirect: "MT5 direct (EA + Upstash) · rapide",
    optMfx: "Myfxbook · lent",
    source: (b) => `Source : ${b === "upstash" ? "MT5 direct (Upstash)" : "Myfxbook"}`,
    preview: "Aperçu du widget",
    editUp: "Modifier la connexion Upstash",
    backMfx: "Revenir à Myfxbook",
    toDirect: "Passer en MT5 direct (Upstash)",
    changeMfx: "Changer d'identifiants / de compte",
    diag: "Diagnostic",
    waitlist: "Version sans VPS : rejoindre la liste d'attente",
    wipe: "Tout effacer (déconnexion)",
    close: "Fermer",
    pos: "pos",
    day: "Jour",
    eq: "Éq",
    dl: "Perte jour restante",
    dlShort: "PJ",
    dd: "DD max restant",
    left: "restant",
    noPosition: "Aucune position ouverte",
    more: (n) => `+${n} autre(s)`,
    noData: "aucune donnée",
    notifTitle: (p) => `Perte journalière : ${p} % utilisés`,
    notifBody: (room, c) => `Plus que ${room} ${c} avant ta perte journalière maximale.`,
  },
};
const L = TEXT[LANG];

// ----------------------------- DATA ----------------------------------

// Upstash settings: iOS keychain (setup assistant) first, else CONFIG
const KC_UP = { url: "mt5pnl.upstash.url", token: "mt5pnl.upstash.token" };
function upCfg() {
  const has = (k) => Keychain.contains(k);
  return {
    url: has(KC_UP.url) ? Keychain.get(KC_UP.url) : CONFIG.upstash.url,
    token: has(KC_UP.token) ? Keychain.get(KC_UP.token) : CONFIG.upstash.token,
  };
}

function activeBackend() {
  if (CONFIG.backend !== "auto") return CONFIG.backend;
  return Keychain.contains(KC_UP.url) ? "upstash" : "myfxbook";
}

async function fetchUpstashWith(url, token, key) {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(url || "")) throw new Error(L.errUrl(url));
  if (!token) throw new Error(L.errTokenEmpty);
  const req = new Request(`${url}/get/${encodeURIComponent(key)}`);
  req.headers = { Authorization: `Bearer ${token}` };
  req.timeoutInterval = 10;
  let text;
  try {
    text = await req.loadString();
  } catch (e) {
    throw new Error(L.errUnreachable(url, e.message));
  }
  const code = req.response ? req.response.statusCode : 0;
  let res = {};
  try {
    res = JSON.parse(text);
  } catch (e) {}
  if (code === 401 || code === 403 || /WRONGPASS|unauthori/i.test(res.error || "")) {
    throw new Error(L.errTokenRefused(code, res.error || text));
  }
  if (res.error) throw new Error(`Upstash: ${res.error} (HTTP ${code})`);
  if (code >= 400) throw new Error(`HTTP ${code}: ${String(text).slice(0, 120)}`);
  if (!res.result) throw new Error(L.errKeyEmpty(key));
  try {
    return JSON.parse(res.result);
  } catch (e) {
    throw new Error(L.errBadData(key, String(res.result).slice(0, 80)));
  }
}

// Cleans what was pasted: accepts the bare value, a .env line
// (UPSTASH_REDIS_REST_URL="..."), a curl command, quotes, spaces...
function cleanUpstashInput(urlRaw, tokenRaw) {
  const all = `${urlRaw || ""}\n${tokenRaw || ""}`;
  // the Upstash host name is enough (even from a redis://user:pwd@host:6379 address)
  const host = /(?:^|[\/@\s"'=])([a-z0-9-]+(?:\.[a-z0-9-]+)*\.upstash\.io)/i.exec(all);
  let url = host ? "https://" + host[1] : (urlRaw || "").trim();
  url = url.replace(/^http:/i, "https:").replace(/\/+$/, "");
  if (url && !/^https:\/\//i.test(url)) url = "https://" + url;
  url = url.replace(/^https:\/\//i, "https://").toLowerCase();

  const pick = (txt) => {
    if (!txt) return "";
    const env = /UPSTASH_REDIS_REST(?:_READONLY)?_TOKEN\s*=\s*["']?([^"'\s]+)/i.exec(txt);
    if (env) return env[1];
    const bearer = /Bearer\s+([^"'\s]+)/i.exec(txt);
    if (bearer) return bearer[1];
    return txt.replace(/["'\s]/g, "");
  };
  let token = pick(tokenRaw);
  // everything pasted in the first field (.env block)?
  if (!token || /upstash\.io/i.test(token)) token = pick(/TOKEN|Bearer/i.test(urlRaw || "") ? urlRaw : "");
  return { url, token };
}

async function fetchUpstash(key) {
  const { url, token } = upCfg();
  return fetchUpstashWith(url, token, key);
}

// Setup assistant: direct MT5 connection through Upstash
async function setupUpstash() {
  const a = new Alert();
  a.title = L.upTitle;
  a.message = L.upMsg;
  a.addTextField("https://xxx.upstash.io", Keychain.contains(KC_UP.url) ? Keychain.get(KC_UP.url) : "");
  a.addSecureTextField(L.upTokenField, "");
  a.addAction(L.connect);
  a.addCancelAction(L.cancel);
  if ((await a.presentAlert()) === -1) return false;

  const { url, token } = cleanUpstashInput(a.textFieldValue(0), a.textFieldValue(1));

  const info = new Alert();
  info.addAction(L.ok);
  try {
    const d = await fetchUpstashWith(url, token, CONFIG.upstash.key);
    Keychain.set(KC_UP.url, url);
    Keychain.set(KC_UP.token, token);
    info.title = L.connected;
    info.message = L.connectedMsg(d, Math.round(Date.now() / 1000 - d.ts));
    await info.presentAlert();
    return true;
  } catch (e) {
    info.title = L.connFail;
    info.message = e.message + L.connFailDetail(url, L.tokenDesc(token));
    await info.presentAlert();
    return false;
  }
}

async function fetchMetaApi() {
  const { token, accountId, region } = CONFIG.metaapi;
  const base = `https://mt-client-api-v1.${region}.agiliumtrade.ai/users/current/accounts/${accountId}`;
  const get = async (path) => {
    const req = new Request(base + path);
    req.headers = { "auth-token": token, Accept: "application/json" };
    req.timeoutInterval = 15;
    const json = await req.loadJSON();
    if (req.response.statusCode >= 400) {
      throw new Error(json.message || `MetaApi HTTP ${req.response.statusCode}`);
    }
    return json;
  };
  const [info, positions] = await Promise.all([get("/account-information"), get("/positions")]);
  return {
    ts: Math.floor(Date.now() / 1000),
    login: info.login,
    currency: info.currency,
    balance: info.balance,
    equity: info.equity,
    floating: info.equity - info.balance,
    today: null, // not computed with MetaApi
    margin: info.margin,
    count: positions.length,
    positions: positions.map((p) => ({
      sym: p.symbol,
      side: String(p.type).includes("BUY") ? "buy" : "sell",
      vol: p.volume,
      open: p.openPrice,
      cur: p.currentPrice,
      pnl: (p.profit || 0) + (p.swap || 0),
    })),
  };
}

// ----------------------------- MYFXBOOK ------------------------------

const KC = {
  email: "mt5pnl.myfxbook.email",
  password: "mt5pnl.myfxbook.password",
  session: "mt5pnl.myfxbook.session",
  account: "mt5pnl.myfxbook.account",
};
const kcGet = (k) => (Keychain.contains(k) ? Keychain.get(k) : null);

async function mfxCall(method, params) {
  const qs = Object.entries(params)
    .map(([k, v]) => {
      // the session returned by Myfxbook may already be encoded
      const val = k === "session" && String(v).includes("%") ? v : encodeURIComponent(v);
      return `${k}=${val}`;
    })
    .join("&");
  const req = new Request(`https://www.myfxbook.com/api/${method}.json?${qs}`);
  req.timeoutInterval = 15;
  const json = await req.loadJSON();
  if (json.error) throw new Error(json.message || `Myfxbook: ${method} error`);
  return json;
}

async function mfxLogin(email, password) {
  const res = await mfxCall("login", { email, password });
  Keychain.set(KC.session, res.session);
  return res.session;
}

// Calls the API with the cached session, logs in again once if it expired
async function mfxAuthed(method, params = {}) {
  let session = kcGet(KC.session);
  if (session) {
    try {
      return await mfxCall(method, { session, ...params });
    } catch (e) {
      if (!/session/i.test(e.message)) throw e;
    }
  }
  const email = kcGet(KC.email);
  const password = kcGet(KC.password);
  if (!email || !password) throw new Error(L.mfxOpenScript);
  session = await mfxLogin(email, password);
  return mfxCall(method, { session, ...params });
}

// Myfxbook returns "MM/dd/yyyy HH:mm", apparently GMT (no time zone given).
// Tries GMT; if that lands in the future, tries local time.
function parseMfxDate(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(str || "");
  const now = Date.now();
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[3], +m[1] - 1, +m[2], +m[4], +m[5]];
  const utc = Date.UTC(y, mo, d, h, mi);
  if (utc <= now + 5 * 60 * 1000) return utc;
  const local = new Date(y, mo, d, h, mi).getTime();
  if (local <= now + 5 * 60 * 1000) return local;
  return null;
}

// Remembers when the widget last saw the numbers change.
// Safety net if the Myfxbook date is in an unexpected time zone.
const seenPath = fm.joinPath(fm.cacheDirectory(), "mt5-pnl-seen.json");
function lastChangeTime(fingerprint) {
  let seen = null;
  try {
    if (fm.fileExists(seenPath)) seen = JSON.parse(fm.readString(seenPath));
  } catch (e) {}
  if (seen && seen.fp === fingerprint) return seen.t;
  const t = Date.now();
  fm.writeString(seenPath, JSON.stringify({ fp: fingerprint, t }));
  return seen ? t : null; // first run: no info
}

function pickAccount(accounts, wanted) {
  if (wanted) {
    const w = wanted.toLowerCase();
    const hit = accounts.find(
      (a) => String(a.accountId) === wanted || String(a.id) === wanted || (a.name || "").toLowerCase() === w
    );
    if (hit) return hit;
  }
  const saved = kcGet(KC.account);
  return accounts.find((a) => String(a.id) === saved) || accounts[0];
}

async function fetchMyfxbook(wanted) {
  const { accounts } = await mfxAuthed("get-my-accounts");
  if (!accounts || accounts.length === 0) throw new Error(L.mfxNoAccount);
  const acc = pickAccount(accounts, wanted);
  const { openTrades = [] } = await mfxAuthed("get-open-trades", { id: acc.id });
  const positions = openTrades.map((t) => ({
    sym: t.symbol,
    side: /buy/i.test(t.action) ? "buy" : "sell",
    vol: t.sizing ? Number(t.sizing.value) : 0,
    open: Number(t.openPrice),
    sl: Number(t.sl),
    tp: Number(t.tp),
    pnl: Number(t.profit || 0) + Number(t.swap || 0),
  }));
  const fingerprint = [acc.id, acc.equity, acc.balance, ...positions.map((p) => p.pnl)].join("|");
  const fromSource = parseMfxDate(acc.lastUpdateDate);
  const fromChange = lastChangeTime(fingerprint);
  const best = Math.max(fromSource || 0, fromChange || 0) || Date.now();
  return {
    ts: Math.floor(best / 1000),
    sourceDate: acc.lastUpdateDate,
    login: acc.accountId,
    name: acc.name,
    currency: acc.currency,
    balance: Number(acc.balance),
    equity: Number(acc.equity),
    floating: Number(acc.equity) - Number(acc.balance),
    today: null,
    count: positions.length,
    positions,
  };
}

// Setup assistant (run from the Scriptable app)
async function setupMyfxbook() {
  const a = new Alert();
  a.title = L.mfxTitle;
  a.message = L.mfxMsg;
  a.addTextField(L.email, kcGet(KC.email) || "");
  a.addSecureTextField(L.password, "");
  a.addAction(L.signIn);
  a.addCancelAction(L.cancel);
  if ((await a.presentAlert()) === -1) return false;
  const email = a.textFieldValue(0).trim();
  const password = a.textFieldValue(1);

  try {
    await mfxLogin(email, password);
  } catch (e) {
    const err = new Alert();
    err.title = L.loginRefused;
    err.message = e.message;
    err.addAction(L.ok);
    await err.presentAlert();
    return false;
  }
  Keychain.set(KC.email, email);
  Keychain.set(KC.password, password);

  const { accounts } = await mfxAuthed("get-my-accounts");
  if (!accounts || accounts.length === 0) {
    const none = new Alert();
    none.title = L.noAccTitle;
    none.message = L.noAccMsg;
    none.addAction(L.ok);
    await none.presentAlert();
    return false;
  }
  let chosen = accounts[0];
  if (accounts.length > 1) {
    const pick = new Alert();
    pick.title = L.whichAcc;
    accounts.forEach((acc) => pick.addAction(`${acc.name} (${acc.accountId})`));
    chosen = accounts[await pick.presentSheet()] || chosen;
  }
  Keychain.set(KC.account, String(chosen.id));
  return true;
}

async function diagnostic() {
  const b = activeBackend();
  const a = new Alert();
  a.title = L.diagTitle(b);
  const fmtT = (t) => (t ? new Date(t).toLocaleString(L.locale) : "?");
  const st = readStatus();
  const common = L.diagCommon(fmtT(Date.now()), fmtT(st.lastOk), st.runs || 0, st.lastError);
  try {
    if (b === "upstash") {
      const d = await fetchUpstash(CONFIG.upstash.key);
      a.message = L.diagUp(d, fmtT(d.ts * 1000)) + common;
    } else {
      const { accounts } = await mfxAuthed("get-my-accounts");
      const acc = pickAccount(accounts, (args.widgetParameter || "").trim());
      a.message = L.diagMfx(acc, fmtT(parseMfxDate(acc.lastUpdateDate))) + common;
    }
  } catch (e) {
    a.message = `${L.error}: ${e.message}\n` + common;
  }
  a.addAction(L.copy);
  a.addCancelAction(L.ok);
  if ((await a.presentAlert()) === 0) Pasteboard.copy(a.message);
}

async function appMenu() {
  if (CONFIG.backend === "metaapi") return true;
  if (CONFIG.backend === "upstash" && !Keychain.contains(KC_UP.url) && /YOUR-DB/.test(CONFIG.upstash.url)) {
    return setupUpstash();
  }
  const b = activeBackend();
  if (b === "myfxbook" && !kcGet(KC.email)) {
    const first = new Alert();
    first.title = L.whereFrom;
    first.addAction(L.optDirect);
    first.addAction(L.optMfx);
    first.addAction(L.waitlist);
    first.addCancelAction(L.cancel);
    const c = await first.presentSheet();
    if (c === 0) return setupUpstash();
    if (c === 1) return setupMyfxbook();
    if (c === 2) Safari.open(WAITLIST_URL);
    return false;
  }

  const m = new Alert();
  m.title = "RiskPeek";
  m.message = L.source(b);
  const actions = [[L.preview, async () => true]];
  if (b === "upstash") {
    actions.push([L.editUp, setupUpstash]);
    actions.push([
      L.backMfx,
      async () => {
        Keychain.remove(KC_UP.url);
        Keychain.remove(KC_UP.token);
        return kcGet(KC.email) ? true : setupMyfxbook();
      },
    ]);
  } else {
    actions.push([L.toDirect, setupUpstash]);
    actions.push([L.changeMfx, setupMyfxbook]);
  }
  actions.push([L.diag, async () => { await diagnostic(); return false; }]);
  actions.push([L.waitlist, async () => { Safari.open(WAITLIST_URL); return false; }]);
  actions.forEach(([label]) => m.addAction(label));
  m.addDestructiveAction(L.wipe);
  m.addCancelAction(L.close);
  const r = await m.presentSheet();
  if (r === -1) return false;
  if (r < actions.length) return actions[r][1]();
  Object.values(KC).concat(Object.values(KC_UP)).forEach((k) => Keychain.contains(k) && Keychain.remove(k));
  [cachePath, notifPath].forEach((p) => fm.fileExists(p) && fm.remove(p));
  return false;
}

// ---------------------------------------------------------------------

// Run log (for the diagnostic)
const statusPath = fm.joinPath(fm.cacheDirectory(), "mt5-pnl-status.json");
function readStatus() {
  try {
    return fm.fileExists(statusPath) ? JSON.parse(fm.readString(statusPath)) : {};
  } catch (e) {
    return {};
  }
}
function writeStatus(st) {
  try {
    fm.writeString(statusPath, JSON.stringify({ ...st, runs: (readStatus().runs || 0) + 1 }));
  } catch (e) {}
}

// Daily loss notification, once per threshold and per day
async function maybeNotify(d) {
  if (!d.dl || !(d.dl.limit > 0)) return;
  const usedPct = (d.dl.used / d.dl.limit) * 100;
  const day = `${d.login}|${new Date().toDateString()}`;
  let st = {};
  try {
    if (fm.fileExists(notifPath)) st = JSON.parse(fm.readString(notifPath));
  } catch (e) {}
  if (st.day !== day || !Array.isArray(st.sent)) st = { day, sent: [] };
  const due = [...CONFIG.alertAtPct].sort((x, y) => y - x).find((p) => usedPct >= p && !st.sent.includes(p));
  if (due === undefined) return;
  try {
    const n = new Notification();
    n.title = L.notifTitle(due);
    n.body = L.notifBody(fmt(d.dl.room, { sign: false, decimals: 0 }), cur(d));
    await n.schedule();
  } catch (e) {}
  // also marks lower thresholds, so a jump from 0 to 85% sends a single alert
  st.sent = [...new Set([...st.sent, ...CONFIG.alertAtPct.filter((p) => p <= due)])];
  fm.writeString(notifPath, JSON.stringify(st));
}

async function loadData(key) {
  try {
    const backend = activeBackend();
    const data =
      backend === "myfxbook"
        ? await fetchMyfxbook((args.widgetParameter || "").trim())
        : backend === "metaapi"
        ? await fetchMetaApi()
        : await fetchUpstash(key);
    data.fetchedAt = Date.now();
    fm.writeString(cachePath, JSON.stringify(data));
    writeStatus({ lastRun: Date.now(), lastOk: Date.now(), lastError: null });
    await maybeNotify(data);
    return { data, error: null };
  } catch (e) {
    writeStatus({ ...readStatus(), lastRun: Date.now(), lastError: e.message });
    // Offline or error: shows the last known value
    if (fm.fileExists(cachePath)) {
      return { data: JSON.parse(fm.readString(cachePath)), error: e.message };
    }
    return { data: null, error: e.message };
  }
}

// ---------------------------- FORMATTING -----------------------------

const SEP = LANG === "fr" ? { group: " ", dec: "," } : { group: ",", dec: "." };

function fmt(n, { sign = true, decimals = 2 } = {}) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  const abs = Math.abs(n).toFixed(decimals);
  const [int, dec] = abs.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, SEP.group);
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  return (sign ? s : n < 0 ? "−" : "") + grouped + (dec ? SEP.dec + dec : "");
}

function compact(n) {
  const abs = Math.abs(n);
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  const one = (x) => x.toFixed(1).replace(".", SEP.dec);
  if (abs >= 1e6) return s + one(abs / 1e6) + "M";
  if (abs >= 1e4) return s + Math.round(abs / 1e3) + "k";
  if (abs >= 1e3) return s + one(abs / 1e3) + "k";
  return s + Math.round(abs);
}

// Colors (home screen widgets; iOS shows lock screen widgets in monochrome)
const THEME = {
  bgTop: new Color("#0b1320"),
  bgBottom: new Color("#05070b"),
  accent: new Color("#2fe08a"),
  text: Color.white(),
  muted: new Color("#8b95a5"),
  track: new Color("#ffffff", 0.12),
  green: new Color("#30D158"),
  red: new Color("#FF453A"),
  amber: new Color("#FFD60A"),
  buy: new Color("#18b6ff"),
  sell: new Color("#ff9f0a"),
};
const REFRESH = "🔄";

const cur = (d) => CURRENCY_SYMBOLS[d.currency] || d.currency || "";
const pnlColor = (n) => (n > 0 ? THEME.green : n < 0 ? THEME.red : THEME.muted);
const arrow = (n) => (n > 0 ? "▲" : n < 0 ? "▼" : "■");
const isStale = (d) => Date.now() / 1000 - d.ts > (CONFIG.staleAfterMin[activeBackend()] || 5) * 60;

// Share of the limit still available (0 to 1), and its color
const ratio = (r) => (r && r.limit > 0 ? Math.max(0, Math.min(1, r.room / r.limit)) : null);
const riskColor = (q) => (q === null ? THEME.muted : q < 0.25 ? THEME.red : q < 0.45 ? THEME.amber : THEME.green);
const bar = (q, n = 8) => {
  const full = Math.round((q || 0) * n);
  return "▰".repeat(full) + "▱".repeat(n - full);
};
const money0 = (n) => fmt(n, { sign: false, decimals: 0 });

const pad = (n) => String(n).padStart(2, "0");
const hm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// Time of the last widget refresh, with a warning if the numbers are old
const runTime = (d) => (d.fetchedAt ? hm(d.fetchedAt) : "?");
const refreshLabel = (d, error) => `${error || isStale(d) ? "⚠︎ " : ""}${REFRESH} ${runTime(d)}`;

// Rounded progress bar drawn as an image (home screen widgets)
function barImage(q, width, color) {
  const h = 6;
  const ctx = new DrawContext();
  ctx.size = new Size(width, h);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const pill = (w, c) => {
    const p = new Path();
    p.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2);
    ctx.addPath(p);
    ctx.setFillColor(c);
    ctx.fillPath();
  };
  pill(width, THEME.track);
  if (q > 0) pill(Math.max(h, width * q), color);
  return ctx.getImage();
}

// ----------------------------- WIDGETS -------------------------------

function errorWidget(msg) {
  const w = new ListWidget();
  const t = w.addText("MT5 · " + msg);
  t.font = Font.systemFont(11);
  t.minimumScaleFactor = 0.6;
  return w;
}

// Lock screen: inline (above the clock)
function inlineWidget(d) {
  const w = new ListWidget();
  const risk = d.dl ? ` · ${L.dlShort} ${money0(d.dl.room)} ${L.left}` : ` · ${d.count} ${L.pos}`;
  const t = w.addText(`${arrow(d.floating)} ${fmt(d.floating)} ${cur(d)}${risk}`);
  t.font = Font.semiboldSystemFont(12);
  return w;
}

// Lock screen: circular
function circularWidget(d) {
  const w = new ListWidget();
  w.addAccessoryWidgetBackground = true;
  const s = w.addStack();
  s.layoutVertically();
  s.centerAlignContent();

  const l = s.addText("P&L");
  l.font = Font.semiboldSystemFont(9);
  l.textOpacity = 0.7;
  l.centerAlignText();

  const v = s.addText(compact(d.floating));
  v.font = Font.boldRoundedSystemFont(15);
  v.minimumScaleFactor = 0.5;
  v.lineLimit = 1;
  v.centerAlignText();

  const q = ratio(d.dl);
  const c = s.addText(q === null ? `${d.count} ${L.pos}` : `${L.dlShort} ${Math.round(q * 100)}%`);
  c.font = Font.systemFont(8);
  c.textOpacity = 0.7;
  c.centerAlignText();
  return w;
}

// Lock screen: rectangular (the most useful one)
function rectangularWidget(d, error) {
  const w = new ListWidget();

  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText(`MT5 · ${d.count} ${L.pos}`);
  title.font = Font.semiboldSystemFont(11);
  title.textOpacity = 0.7;
  title.lineLimit = 1;
  head.addSpacer();
  const time = head.addText(refreshLabel(d, error));
  time.font = Font.semiboldSystemFont(11);
  time.textOpacity = 0.7;
  time.lineLimit = 1;

  const v = w.addText(`${arrow(d.floating)} ${fmt(d.floating)} ${cur(d)}`);
  v.font = Font.boldRoundedSystemFont(20);
  v.minimumScaleFactor = 0.6;
  v.lineLimit = 1;

  let line;
  if (d.dl) {
    line = `${L.dlShort} ${money0(d.dl.room)} / ${money0(d.dl.limit)} ${bar(ratio(d.dl))}`;
  } else {
    const parts = [];
    if (d.today !== null && d.today !== undefined) parts.push(`${L.day} ${fmt(d.today)}`);
    parts.push(`${L.eq} ${money0(d.equity)}`);
    line = parts.join(" · ");
  }
  const sub = w.addText(line);
  sub.font = Font.systemFont(11);
  sub.minimumScaleFactor = 0.7;
  sub.lineLimit = 1;
  return w;
}

// Risk line: label, room / limit in color, and a colored progress bar below
function riskRow(w, label, r, barWidth) {
  const q = ratio(r);
  const color = riskColor(q);
  const row = w.addStack();
  row.centerAlignContent();
  const l = row.addText(label);
  l.font = Font.mediumSystemFont(11);
  l.textColor = THEME.muted;
  l.lineLimit = 1;
  row.addSpacer();
  const v = row.addText(`${money0(r.room)} / ${money0(r.limit)}`);
  v.font = Font.semiboldMonospacedSystemFont(11);
  v.textColor = color;
  v.lineLimit = 1;
  w.addSpacer(3);
  const img = w.addImage(barImage(q || 0, barWidth, color));
  img.imageSize = new Size(barWidth, 6);
  w.addSpacer(5);
}

// Home screen: small / medium / large
function homeWidget(d, error, family) {
  const w = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [THEME.bgTop, THEME.bgBottom];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.setPadding(14, 14, 14, 14);
  const barWidth = family === "small" ? 128 : 300;

  const head = w.addStack();
  head.centerAlignContent();
  const logo = head.addText("▲ RiskPeek");
  logo.font = Font.boldRoundedSystemFont(12);
  logo.textColor = THEME.accent;
  logo.lineLimit = 1;
  head.addSpacer();
  const time = head.addText(refreshLabel(d, error));
  time.font = Font.semiboldSystemFont(10);
  time.textColor = error || isStale(d) ? THEME.amber : THEME.muted;
  time.lineLimit = 1;

  w.addSpacer(6);
  const v = w.addText(`${arrow(d.floating)} ${fmt(d.floating)} ${cur(d)}`);
  v.font = Font.boldRoundedSystemFont(family === "small" ? 22 : 26);
  v.textColor = pnlColor(d.floating);
  v.minimumScaleFactor = 0.5;
  v.lineLimit = 1;

  const sub = w.addStack();
  sub.centerAlignContent();
  if (d.today !== null && d.today !== undefined) {
    const dl = sub.addText(`${L.day} `);
    dl.font = Font.systemFont(11);
    dl.textColor = THEME.muted;
    const dv = sub.addText(fmt(d.today));
    dv.font = Font.semiboldSystemFont(11);
    dv.textColor = pnlColor(d.today);
    const sep = sub.addText(" · ");
    sep.font = Font.systemFont(11);
    sep.textColor = THEME.muted;
  }
  const eq = sub.addText(`${L.eq} ${money0(d.equity)}`);
  eq.font = Font.systemFont(11);
  eq.textColor = THEME.muted;
  eq.lineLimit = 1;

  const risks = [];
  if (d.dl) risks.push([family === "small" ? L.dlShort : L.dl, d.dl]);
  if (d.dd && family !== "small") risks.push([L.dd, d.dd]);
  if (risks.length) {
    w.addSpacer(8);
    risks.forEach(([label, r]) => riskRow(w, label, r, barWidth));
  }

  // Positions that still fit under the risk bars
  const n = risks.length;
  const max = family === "small" ? (n ? 1 : 2) : family === "medium" ? [3, 1, 0][n] : 10 - 2 * n;
  const list = [...(d.positions || [])].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  w.addSpacer(risks.length ? 2 : 8);
  if (list.length === 0 && max > 0) {
    const t = w.addText(L.noPosition);
    t.font = Font.systemFont(11);
    t.textColor = THEME.muted;
  }
  for (const p of list.slice(0, max)) {
    const row = w.addStack();
    row.centerAlignContent();
    const side = row.addText(p.side === "buy" ? "▲ " : "▼ ");
    side.font = Font.boldSystemFont(9);
    side.textColor = p.side === "buy" ? THEME.buy : THEME.sell;
    const name = row.addText(`${p.sym} `);
    name.font = Font.semiboldSystemFont(11);
    name.textColor = THEME.text;
    name.lineLimit = 1;
    const vol = row.addText(String(p.vol));
    vol.font = Font.systemFont(10);
    vol.textColor = THEME.muted;
    row.addSpacer();
    const pv = row.addText(fmt(p.pnl));
    pv.font = Font.semiboldMonospacedSystemFont(11);
    pv.textColor = pnlColor(p.pnl);
    w.addSpacer(2);
  }
  if (list.length > max && max > 0) {
    const more = w.addText(L.more(list.length - max));
    more.font = Font.systemFont(10);
    more.textColor = THEME.muted;
  }
  w.addSpacer();
  return w;
}

// ------------------------------- MAIN --------------------------------

async function main() {
  const key = (args.widgetParameter || "").trim() || CONFIG.upstash.key;
  if (!config.runsInWidget && !(await appMenu())) return;

  const family = config.widgetFamily || "accessoryRectangular";
  const { data, error } = await loadData(key);

  let widget;
  if (!data) {
    widget = errorWidget(error || L.noData);
  } else if (family === "accessoryInline") {
    widget = inlineWidget(data);
  } else if (family === "accessoryCircular") {
    widget = circularWidget(data);
  } else if (family === "accessoryRectangular") {
    widget = rectangularWidget(data, error);
  } else {
    widget = homeWidget(data, error, family);
  }

  widget.refreshAfterDate = new Date(Date.now() + CONFIG.refreshAfterSec * 1000);

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    // Run from the Scriptable app: preview
    if (error) console.warn(error);
    if (data && typeof widget.presentAccessoryRectangular === "function") {
      await widget.presentAccessoryRectangular();
    } else {
      await widget.presentMedium();
    }
  }
}

await main();
Script.complete();

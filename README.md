# RiskPeek free widget: your MT5 risk on the iPhone lock screen

*[Version française plus bas](#version-française)*

A free iPhone widget for MetaTrader 5 traders, built for prop firm accounts. It shows, on your lock screen or home screen:

- open P&L, today's realized P&L, equity and open positions
- **daily loss left** before your limit, with a gauge (optional)
- **max drawdown left**, static or trailing (optional)
- a notification when you have used **50% and 80%** of your daily loss limit

```
 ┌──────────────────────────────────────┐
 │ MT5 · 2 pos · numbers at 14:32       │
 │ ▼ −479.50 $                          │
 │ DL 900 / 5,000 ▰▱▱▱▱▱▱▱              │
 └──────────────────────────────────────┘
```

It is **read-only**: the EA never opens, closes or modifies a trade.

> **Coming next: RiskPeek, the no-VPS version.** Same widget, but you only enter your MT5 login and investor password in an app: no EA, no PC left on. [Join the waitlist](https://riskpeek.netlify.app).

## How it works

```
 MT5 (PC / VPS)              Upstash Redis (free)          iPhone
 ┌──────────────┐  every 15 s ┌──────────────┐    read    ┌──────────────────┐
 │ EA PnLPusher │ ──────────► │  key mt5pnl  │ ◄───────── │ Scriptable widget│
 └──────────────┘             └──────────────┘            └──────────────────┘
```

- `mql5/PnLPusher.mq5`: an Expert Advisor that reads the account every 15 s and sends a small JSON to your own Upstash database, only when something changed.
- `scriptable/RiskPeek-Widget.js`: the widget, for the free iOS app [Scriptable](https://apps.apple.com/app/scriptable/id1405459188). English or French, following your iPhone's language.

**The EA needs MetaTrader 5 for desktop** (Windows, macOS or a VPS) running while you trade. The MT5 iPhone app cannot run EAs. No computer on all day? See [the Myfxbook mode](#no-computer-myfxbook-mode-slower).

## Setup (about 10 minutes)

### 1. Create the Upstash database (free)

1. Sign up at <https://console.upstash.com>, then **Create Database** (Redis, region close to your broker or VPS).
2. In the database, **REST API** section, note:
   - the REST URL (e.g. `https://eu1-xxx-12345.upstash.io`)
   - the **read/write token**: for the EA
   - the **Read-Only token**: for the iPhone

The free plan is plenty: the EA only sends when the numbers change.

### 2. Install the EA in MT5

1. In MT5: **File › Open Data Folder › MQL5 › Experts**, copy `PnLPusher.mq5` there.
2. Open it in **MetaEditor** and compile it (**F7**).
3. **Tools › Options › Expert Advisors**: tick **Allow WebRequest for listed URL** and add your Upstash URL.
4. Drag **PnLPusher** onto any chart and fill in:
   - `UpstashUrl`: the REST URL, **without a trailing `/`**
   - `UpstashToken`: the read/write token
5. Turn on **Algo Trading**. The **Experts** tab should show no error.

### 3. Your prop firm rules (optional)

Fill these EA inputs to get the risk gauges and alerts. Check the exact rules of your firm: they differ from one firm to another.

| Input | Meaning | Example |
|---|---|---|
| `DailyLossPct` | Daily loss limit in %, 0 = off | `5` |
| `MaxDrawdownPct` | Max drawdown in %, 0 = off | `10` |
| `AccountSize` | Account size the % apply to. 0 = start-of-day balance | `100000` |
| `TrailingDrawdown` | Max drawdown follows the highest balance | `false` |
| `DayResetHour` | Hour of the daily reset, **broker server time** (0-23) | `0` |

How it is computed:

- **Daily loss**: limit = `DailyLossPct` % of `AccountSize` (or of the start-of-day balance if 0). Loss used = start-of-day balance minus current equity, so open trades count. Start-of-day balance = current balance minus the P&L closed since the reset.
- **Max drawdown**: floor = account size minus `MaxDrawdownPct` %. In trailing mode, the reference is the highest balance the EA has seen. A static max drawdown needs `AccountSize`.

### 4. Install the widget on the iPhone

1. Install **Scriptable** from the App Store.
2. Create a new script (**+**), name it `RiskPeek`, and paste the content of `scriptable/RiskPeek-Widget.js`.
3. Tap ▶︎, choose **MT5 direct (EA + Upstash)**, then paste the URL and the **Read-Only** token. The script tests the connection and stores the settings in the iOS keychain.
4. Long-press the lock screen, **Customize › Lock Screen**, tap the widget area, add **Scriptable** (rectangular size recommended), tap it and choose the `RiskPeek` script.

All lock screen sizes (inline, circular, rectangular) and home screen sizes (small, medium, large) work. Allow notifications for Scriptable to get the 50% / 80% alerts.

**Several accounts?** Run one EA per account with a different `RedisKey` (e.g. `mt5pnl_challenge`), and type that key in the widget's **Parameter** field.

## No computer: Myfxbook mode (slower)

Link your MT5 account to [Myfxbook](https://www.myfxbook.com) (free) with the investor password, run the script and choose **Myfxbook**. Nothing to install on a PC, but the numbers are 5 to 20 minutes late, and today's P&L and the risk gauges are not available.

## Good to know

- **iOS limits widget refreshes**, usually every 5 to 15 minutes depending on usage and battery. The script asks every 60 s, iOS decides. Tapping the widget opens Scriptable and refreshes at once.
- The header shows the time of the numbers. A ⚠︎ appears if they are more than 5 minutes old or if the network failed; the last known values stay on screen.
- **Security**: the EA has no trading code. The iPhone uses the Read-Only token, so even if it leaks, nobody can change your data. Never share your tokens.

This widget displays information only and is not financial advice. Trading involves substantial risk of loss. MetaTrader is a trademark of MetaQuotes Ltd; this project is not affiliated with MetaQuotes or any prop firm.

---

## Version française

Un widget iPhone gratuit pour les traders MetaTrader 5, pensé pour les comptes de prop firms. Sur l'écran verrouillé ou l'écran d'accueil :

- P&L flottant, P&L réalisé du jour, équité et positions ouvertes
- **perte journalière restante** avant ta limite, avec une jauge (facultatif)
- **drawdown max restant**, fixe ou glissant (facultatif)
- une notification quand tu as utilisé **50 % et 80 %** de ta perte journalière maximale

Il est en **lecture seule** : l'EA n'ouvre, ne ferme et ne modifie aucun trade.

> **Bientôt : RiskPeek, la version sans VPS.** Le même widget, mais tu saisis seulement ton identifiant MT5 et ton mot de passe investisseur dans une app : pas d'EA, pas de PC allumé. [Rejoindre la liste d'attente](https://riskpeek.netlify.app).

### Installation (environ 10 minutes)

1. **Upstash** (gratuit) : crée un compte sur <https://console.upstash.com>, puis **Create Database** (Redis). Dans **REST API**, note l'URL REST, le token **lecture/écriture** (pour l'EA) et le token **Read-Only** (pour l'iPhone).
2. **EA dans MT5 pour ordinateur** (Windows, macOS ou VPS, allumé pendant que tu trades) :
   - **Fichier › Ouvrir le dossier des données › MQL5 › Experts** : copie `PnLPusher.mq5`, puis compile-le dans MetaEditor (**F7**).
   - **Outils › Options › Expert Advisors** : coche **Autoriser WebRequest pour les URL listées** et ajoute ton URL Upstash.
   - Glisse **PnLPusher** sur un graphique, renseigne `UpstashUrl` (sans `/` final) et `UpstashToken` (lecture/écriture), puis active **Algo Trading**.
3. **Règles de ta prop firm** (facultatif) : `DailyLossPct` (ex. `5`), `MaxDrawdownPct` (ex. `10`), `AccountSize` (ex. `100000`, 0 = solde de début de journée), `TrailingDrawdown`, `DayResetHour` (heure de remise à zéro, **heure du serveur du broker**). Vérifie les règles exactes de ta firme : elles varient. Le calcul détaillé est décrit dans la partie anglaise.
4. **Widget sur l'iPhone** : installe **Scriptable**, crée un script `RiskPeek`, colle `scriptable/RiskPeek-Widget.js`, appuie sur ▶︎ et choisis **MT5 direct (EA + Upstash)** avec l'URL et le token **Read-Only**. Ajoute ensuite le widget Scriptable sur l'écran verrouillé (format rectangulaire conseillé) et choisis le script `RiskPeek`. Autorise les notifications de Scriptable pour les alertes.

**Sans ordinateur** : mode Myfxbook (compte MT5 relié à Myfxbook avec le mot de passe investisseur). Rien à installer, mais 5 à 20 minutes de retard, sans P&L du jour ni jauges de risque.

**À savoir** : iOS rafraîchit les widgets en général toutes les 5 à 15 minutes ; toucher le widget force l'actualisation. Le widget affiche des informations et ne constitue pas un conseil financier. Le trading comporte un risque important de perte.

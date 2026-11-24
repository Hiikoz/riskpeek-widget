//+------------------------------------------------------------------+
//| PnLPusher.mq5 - RiskPeek free widget (MT5 -> iPhone)             |
//|                                                                  |
//| Sends the account state (open P&L, today's P&L, equity, open     |
//| positions, daily loss and max drawdown room) to an Upstash Redis |
//| database, so a Scriptable widget can show it on the iPhone lock  |
//| screen.                                                          |
//|                                                                  |
//| Setup:                                                           |
//|  1. File > Open Data Folder > MQL5 > Experts: copy this file,    |
//|     then compile it in MetaEditor (F7).                          |
//|  2. Tools > Options > Expert Advisors:                           |
//|     - tick "Allow WebRequest for listed URL"                     |
//|     - add your Upstash URL (e.g. https://xxx.upstash.io)         |
//|  3. Drag the EA onto ANY chart, fill UpstashUrl + UpstashToken   |
//|     (and your prop firm rules if you want the risk gauges),      |
//|     then enable "Algo Trading".                                  |
//|                                                                  |
//| This EA places NO orders: it only reads the account.             |
//| No-VPS version in progress: https://riskpeek.netlify.app         |
//+------------------------------------------------------------------+
#property copyright "RiskPeek"
#property link      "https://riskpeek.netlify.app"
#property version   "1.10"

input group "Upstash"
input string UpstashUrl       = "https://YOUR-DB.upstash.io"; // Upstash REST URL (no trailing /)
input string UpstashToken     = "";                            // Upstash REST token (read/write)
input string RedisKey         = "mt5pnl";                      // Redis key (one per account)
input int    PushEverySec     = 15;                            // Push interval (seconds)
input int    KeepAliveSec     = 300;                           // Forced push even if nothing changed
input int    MaxPositions     = 20;                            // Max positions sent

input group "Prop firm rules (optional)"
input double DailyLossPct     = 0;     // Daily loss limit in % (0 = off)
input double MaxDrawdownPct   = 0;     // Max drawdown in % (0 = off)
input double AccountSize      = 0;     // Account size, e.g. 100000 (0 = start-of-day balance)
input bool   TrailingDrawdown = false; // Max drawdown trails the highest balance
input int    DayResetHour     = 0;     // Daily reset hour, broker server time (0-23)

string   g_lastBody = "";
datetime g_lastPush = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(StringLen(UpstashToken) == 0 || StringFind(UpstashUrl, "YOUR-DB") >= 0)
     {
      Print("PnLPusher: fill UpstashUrl and UpstashToken in the EA inputs.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(DayResetHour < 0 || DayResetHour > 23)
     {
      Print("PnLPusher: DayResetHour must be between 0 and 23.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(MaxDrawdownPct > 0 && AccountSize <= 0 && !TrailingDrawdown)
     {
      Print("PnLPusher: set AccountSize (e.g. 100000) to use a static max drawdown.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   EventSetTimer(PushEverySec < 5 ? 5 : PushEverySec);
   Push(true);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer()                  { Push(false); }
void OnTick()                   { }

//+------------------------------------------------------------------+
string Num(double v, int digits = 2) { return DoubleToString(v, digits); }

string JsonStr(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return "\"" + s + "\"";
  }

//--- Start of the current trading day (broker server time, DayResetHour)
datetime DayStart()
  {
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   dt.hour = DayResetHour; dt.min = 0; dt.sec = 0;
   datetime start = StructToTime(dt);
   if(start > now)
      start -= 86400;
   return start;
  }

//--- Realized P&L since the daily reset, swaps, commissions and fees included
double TodayClosedPnL()
  {
   datetime now = TimeCurrent();
   if(!HistorySelect(DayStart(), now + 3600))
      return 0.0;

   double sum = 0.0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long type = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue; // skip deposits/withdrawals
      sum += HistoryDealGetDouble(deal, DEAL_PROFIT)
           + HistoryDealGetDouble(deal, DEAL_SWAP)
           + HistoryDealGetDouble(deal, DEAL_COMMISSION)
           + HistoryDealGetDouble(deal, DEAL_FEE);
     }
   return sum;
  }

//--- Highest balance seen (kept in a terminal global variable, for trailing drawdown)
double PeakBalance(double balance)
  {
   string name = "RiskPeek_peak_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   double peak = GlobalVariableCheck(name) ? GlobalVariableGet(name) : 0.0;
   if(AccountSize > peak) peak = AccountSize;
   if(balance > peak)     peak = balance;
   GlobalVariableSet(name, peak);
   return peak;
  }

//--- Daily loss and max drawdown room, as a JSON fragment (empty if both are off)
string RiskJson(double balance, double equity, double today)
  {
   double dayStartBal = balance - today;
   double base        = (AccountSize > 0) ? AccountSize : dayStartBal;
   string out = "";

   if(DailyLossPct > 0)
     {
      double limit = base * DailyLossPct / 100.0;
      double used  = MathMax(0.0, dayStartBal - equity);
      out += ",\"dl\":{\"limit\":" + Num(limit)
           + ",\"used\":" + Num(used)
           + ",\"room\":" + Num(limit - used)
           + ",\"start\":" + Num(dayStartBal) + "}";
     }

   if(MaxDrawdownPct > 0)
     {
      double refBal  = TrailingDrawdown ? PeakBalance(balance) : base;
      double ddLimit = refBal * MaxDrawdownPct / 100.0;
      double ddFloor = refBal - ddLimit;
      out += ",\"dd\":{\"limit\":" + Num(ddLimit)
           + ",\"floor\":" + Num(ddFloor)
           + ",\"room\":" + Num(equity - ddFloor)
           + ",\"trailing\":" + (TrailingDrawdown ? "true" : "false") + "}";
     }
   return out;
  }

//--- Builds the JSON body (without timestamp, so changes can be detected)
string BuildCore()
  {
   string pos = "";
   int n = 0;
   int total = PositionsTotal();
   for(int i = 0; i < total && n < MaxPositions; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string sym  = PositionGetString(POSITION_SYMBOL);
      int digits  = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      string side = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "buy" : "sell";
      double pnl  = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);

      if(n > 0) pos += ",";
      pos += "{\"sym\":" + JsonStr(sym)
           + ",\"side\":\"" + side + "\""
           + ",\"vol\":"  + Num(PositionGetDouble(POSITION_VOLUME), 2)
           + ",\"open\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN), digits)
           + ",\"cur\":"  + Num(PositionGetDouble(POSITION_PRICE_CURRENT), digits)
           + ",\"sl\":"   + Num(PositionGetDouble(POSITION_SL), digits)
           + ",\"tp\":"   + Num(PositionGetDouble(POSITION_TP), digits)
           + ",\"pnl\":"  + Num(pnl)
           + "}";
      n++;
     }

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double today   = TodayClosedPnL();

   return "\"login\":"     + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))
        + ",\"currency\":" + JsonStr(AccountInfoString(ACCOUNT_CURRENCY))
        + ",\"balance\":"  + Num(balance)
        + ",\"equity\":"   + Num(equity)
        + ",\"floating\":" + Num(AccountInfoDouble(ACCOUNT_PROFIT))
        + ",\"today\":"    + Num(today)
        + ",\"margin\":"   + Num(AccountInfoDouble(ACCOUNT_MARGIN))
        + ",\"count\":"    + IntegerToString(total)
        + RiskJson(balance, equity, today)
        + ",\"positions\":[" + pos + "]";
  }

//+------------------------------------------------------------------+
void Push(bool force)
  {
   string core = BuildCore();
   datetime now = TimeLocal();

   // Saves Upstash quota: only sends when something changed
   if(!force && core == g_lastBody && (now - g_lastPush) < KeepAliveSec)
      return;

   string json = "{\"ts\":" + IntegerToString((long)TimeGMT()) + "," + core + "}";

   char data[];
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(data, len - 1); // drop the trailing \0

   string url     = UpstashUrl + "/set/" + RedisKey;
   string headers = "Authorization: Bearer " + UpstashToken + "\r\n"
                  + "Content-Type: text/plain\r\n";
   char   result[];
   string resultHeaders;

   ResetLastError();
   int code = WebRequest("POST", url, headers, 5000, data, result, resultHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         Print("PnLPusher: URL not allowed. Add ", UpstashUrl,
               " in Tools > Options > Expert Advisors > WebRequest.");
      else
         Print("PnLPusher: WebRequest failed, error ", err);
      return;
     }
   if(code != 200)
     {
      Print("PnLPusher: HTTP ", code, " -> ", CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8));
      return;
     }

   g_lastBody = core;
   g_lastPush = now;
  }
//+------------------------------------------------------------------+

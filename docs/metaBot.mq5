//+------------------------------------------------------------------+
//|  VSPL XAUUSD bot - SuperTrend + HalfTrend + ADX                  |
//|                                                                  |
//|  The EA is a thin executor. On every NEW candle it sends the     |
//|  last closed candles and its current position to the Node.js     |
//|  server (POST /api/v1/trading/generateSignal). The server runs   |
//|  the same code the backtester uses and answers with              |
//|  target_position = BUY | SELL | FLAT. The EA then makes its      |
//|  position equal to that target:                                  |
//|     SuperTrend and HalfTrend agree (and ADX >= minimum) -> trade|
//|     one of them changes -> close / do not trade                  |
//|                                                                  |
//|  v2.30 WEEKLY NEWS: OnTimer fires every InpNewsSendSeconds.      |
//|  Each time the EA reads this week's MT5 economic calendar        |
//|  (Mon-Sun, UTC) and POSTs it to /api/v1/news/week. The Node      |
//|  controller writes it to a JSON file. No cron on the server.     |
//|                                                                  |
//|  v2.40 LIVE CHART: every InpLiveSeconds (1) OnTimer POSTs the    |
//|  forming + last closed candle, bid/ask and the open position to  |
//|  /api/v1/trading/liveCandles. The server streams it to the       |
//|  browser (live.html). History is sent at start and whenever the  |
//|  server asks for it (need_history).                              |
//|                                                                  |
//|  v2.50 TICKS + TRADE HISTORY: every real tick is buffered in     |
//|  OnTick and sent with the live push (Node saves it as CSV).      |
//|  Closed trades of this EA (entry/exit time + price, P&L, reason) |
//|  are POSTed every InpTradeSyncSeconds to /api/v1/trading/        |
//|  liveTrades. The last sent time is kept in a GlobalVariable so   |
//|  a restart never loses or duplicates a trade.                    |
//|                                                                  |
//|  v2.60 ACCOUNT : the live push also carries the account (login,  |
//|  name, currency, balance, equity, margin). The web Dashboard     |
//|  shows it and the floating trade widget uses the open position.  |
//|                                                                  |
//|  v2.70 NEWS STOP : 15 minutes before until 15 minutes after a    |
//|  scheduled news event (the events this EA sends from the MT5     |
//|  calendar) the EA does not trade. Every InpControlCheckSeconds the  |
//|  timer asks /api/v1/trading/newsStatus. While the answer is      |
//|  blackout=true, every open trade of this EA is closed at once    |
//|  (profit or loss, it does not matter). The signal API also       |
//|  answers FLAT in that window, so nothing new is opened.          |
//|                                                                  |
//|  MANUAL CONTROLS (buttons on the Live Trade page of the app):    |
//|   - Close trade : the EA sees a new closeRequestId in            |
//|     /api/v1/trading/botControl and closes its open trade at once.|
//|     Trading stays ON; the bot waits for a NEW trend.             |
//|   - Trading ON/OFF : while OFF the EA opens no new trade.        |
//|                                                                  |
//|  IMPORTANT: WebRequest does NOT work in the MT5 Strategy Tester. |
//|  Use the "Back Testing" page of the web app instead.             |
//|  Works on any timeframe (the backtest shows which ones pay).     |
//+------------------------------------------------------------------+
#property copyright "VirtusScribe Solutions Pvt. Ltd."
#property version   "2.70"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

CTrade        trade;
CPositionInfo pos;

//--- INPUTS
input string InpApiUrl    = "http://192.168.50.136:3000/api/v1/trading/generateSignal";
input int    InpCandles   = 1000;       // Closed candles sent to the server (min 300)
input double InpLots      = 0.02;
input int    InpMagic     = 20261022;
input int    InpSlippage  = 50;         // Max deviation in points
input int    InpTimeout   = 5000;       // HTTP timeout in ms
input int    InpRetrySecs = 5;          // Wait before asking the server again after a failed call

//--- WEEKLY NEWS
input string InpNewsBaseUrl       = "http://192.168.50.136:3000";  // Node server base URL (add it to Allow WebRequest)
input int    InpNewsSendSeconds   = 30;     // OnTimer sends this week's news every N seconds (30 = testing, 1800 = every 30 minutes for live)
input string InpNewsCurrencies    = "";     // Empty = ALL currencies. Or a comma list, e.g. "USD,EUR,BRL"
input int    InpNewsMinImportance = 0;      // 0 = ALL events, 1 = low+, 2 = medium+, 3 = high only

//--- NEWS STOP + MANUAL CONTROLS (the news minutes are set in the server config.js)
input int    InpControlCheckSeconds  = 3;      // Ask the server every N seconds : news stop, Close trade, Trading ON/OFF

//--- LIVE CHART
input bool   InpLiveEnabled = true;     // Push live candles to the server
input int    InpLiveSeconds = 1;        // Push every N seconds
input int    InpLiveHistory = 500;      // Candles sent at start / when the server asks for history

//--- TICKS + TRADE HISTORY
input int    InpTradeSyncSeconds = 10;  // Send closed trades every N seconds
input int    InpTradeSyncDays    = 30;  // First run only: how many days of closed trades to send

#define TICK_BUF  20000                 // Ticks kept while the server is offline
#define TICK_SEND 2000                  // Max ticks per push

//--- STATE
long     g_tickMsc[];                   // Tick buffer (time in ms, server time)
double   g_tickBid[];
double   g_tickAsk[];
int      g_tickN = 0;
long     g_lastTickMsc = 0;
datetime g_lastTradeSync = 0;           // Last trade sync (local time)
datetime g_lastTradeErr  = 0;
datetime g_lastTradeLog  = 0;           // Last time the trade scan printed a line
datetime g_lastBar   = 0;   // Candle that was processed successfully
uint     g_lastTryMs = 0;   // Tick count of the last failed call
bool     g_needHistory = true;   // Send full history with the next live push
datetime g_lastLive    = 0;      // Last live push (local time)
datetime g_lastNews    = 0;      // Last news send (local time)
datetime g_lastLiveErr = 0;      // Last time a live error was printed
datetime g_lastNewsCheck = 0;    // Last news stop check (local time)
bool     g_newsBlackout  = false;// True while trading is stopped for news
bool     g_tradingEnabled = true;// Trading ON / OFF switch of the app (OFF = no new trade)
long     g_lastCloseRequestId = -1; // Last "Close trade" request seen (-1 = not read yet)

//====================================================================
//  Build the JSON payload: CLOSED candles only, oldest first.
//====================================================================
string BuildPayload(const string positionName)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, false);                       // index 0 = oldest
   int copied = CopyRates(_Symbol, _Period, 1, InpCandles, rates);   // start at shift 1 = last CLOSED candle
   if(copied < 300)
   {
      PrintFormat("[DATA] Only %d candles available, need at least 300. Scroll the chart back to load history.", copied);
      return "";
   }

   string tf = EnumToString(_Period);
   StringReplace(tf, "PERIOD_", "");

   string json = "{";
   json += "\"symbol\":\"" + _Symbol + "\",";
   json += "\"timeframe\":\"" + tf + "\",";
   json += "\"position\":\"" + positionName + "\",";
   json += "\"candles\":[";

   for(int i = 0; i < copied; i++)
   {
      json += "{";
      json += "\"time\":"   + IntegerToString((long)rates[i].time) + ",";
      json += "\"open\":"   + DoubleToString(rates[i].open,  _Digits) + ",";
      json += "\"high\":"   + DoubleToString(rates[i].high,  _Digits) + ",";
      json += "\"low\":"    + DoubleToString(rates[i].low,   _Digits) + ",";
      json += "\"close\":"  + DoubleToString(rates[i].close, _Digits) + ",";
      json += "\"volume\":" + IntegerToString((long)rates[i].tick_volume);
      json += "}";
      if(i < copied - 1) json += ",";
   }

   json += "]}";
   return json;
}

//====================================================================
//  POST to the Node.js server. Returns "" on failure.
//====================================================================
string CallApi(const string payload)
{
   char   reqData[];
   char   resData[];
   string resHeaders;

   StringToCharArray(payload, reqData, 0, StringLen(payload));   // no trailing zero byte

   string headers = "Content-Type: application/json\r\n";
   ResetLastError();
   int res = WebRequest("POST", InpApiUrl, headers, InpTimeout, reqData, resData, resHeaders);

   if(res == -1)
   {
      int err = GetLastError();
      if(err == 4014)
         Print("[API ERROR] Add ", InpApiUrl, " to Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
      else
         PrintFormat("[API ERROR] WebRequest failed. Error=%d (is the Node server running?)", err);
      return "";
   }

   string response = CharArrayToString(resData);
   if(res != 200)
   {
      PrintFormat("[API ERROR] HTTP %d : %s", res, response);
      return "";
   }
   return response;
}

//====================================================================
//  Tiny JSON readers (the server reply is flat JSON, no spaces)
//====================================================================
string ParseString(const string json, const string key)
{
   string search = "\"" + key + "\":\"";
   int start = StringFind(json, search);
   if(start == -1) return "";
   start += StringLen(search);
   int end = StringFind(json, "\"", start);
   if(end == -1) return "";
   return StringSubstr(json, start, end - start);
}

bool ParseBool(const string json, const string key)
{
   string search = "\"" + key + "\":";
   int start = StringFind(json, search);
   if(start == -1) return false;
   start += StringLen(search);
   return (StringFind(StringSubstr(json, start, 5), "true") == 0);
}

string ParseNumber(const string json, const string key)
{
   string search = "\"" + key + "\":";
   int start = StringFind(json, search);
   if(start == -1) return "n/a";
   start += StringLen(search);
   int end = start;
   int len = StringLen(json);
   while(end < len)
   {
      ushort ch = StringGetCharacter(json, end);
      if(ch == ',' || ch == '}') break;
      end++;
   }
   return StringSubstr(json, start, end - start);
}

//====================================================================
//  Position helpers (this EA's magic number on this symbol only)
//====================================================================
string CurrentPositionName()
{
   bool hasBuy = false, hasSell = false;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!pos.SelectByIndex(i))     continue;
      if(pos.Magic()  != InpMagic)  continue;
      if(pos.Symbol() != _Symbol)   continue;
      if(pos.PositionType() == POSITION_TYPE_BUY)  hasBuy  = true;
      if(pos.PositionType() == POSITION_TYPE_SELL) hasSell = true;
   }
   if(hasBuy && hasSell) return "BOTH";   // should never happen; the EA closes everything first
   if(hasBuy)  return "BUY";
   if(hasSell) return "SELL";
   return "NONE";
}

bool CloseAll()
{
   bool ok = true;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!pos.SelectByIndex(i))     continue;
      if(pos.Magic()  != InpMagic)  continue;
      if(pos.Symbol() != _Symbol)   continue;
      ulong  ticket = pos.Ticket();
      double profit = pos.Profit();
      if(trade.PositionClose(ticket))
         PrintFormat("[CLOSED] #%I64u P&L=%.2f", ticket, profit);
      else
      {
         ok = false;
         PrintFormat("[CLOSE FAIL] #%I64u err=%d %s", ticket, GetLastError(), trade.ResultRetcodeDescription());
      }
   }
   return ok;
}

double NormalizeLots(double lots)
{
   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double stepLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(stepLot > 0) lots = MathFloor(lots / stepLot + 0.0000001) * stepLot;
   lots = MathMax(minLot, MathMin(maxLot, lots));
   return NormalizeDouble(lots, 2);
}

void OpenBuy()
{
   double lots = NormalizeLots(InpLots);
   double ask  = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(trade.Buy(lots, _Symbol, ask, 0, 0, "ST+HT BUY"))
      PrintFormat("[BUY] price=%s lots=%.2f", DoubleToString(ask, _Digits), lots);
   else
      PrintFormat("[BUY FAIL] err=%d %s", GetLastError(), trade.ResultRetcodeDescription());
}

void OpenSell()
{
   double lots = NormalizeLots(InpLots);
   double bid  = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(trade.Sell(lots, _Symbol, bid, 0, 0, "ST+HT SELL"))
      PrintFormat("[SELL] price=%s lots=%.2f", DoubleToString(bid, _Digits), lots);
   else
      PrintFormat("[SELL FAIL] err=%d %s", GetLastError(), trade.ResultRetcodeDescription());
}

//====================================================================
//  WEEKLY NEWS
//====================================================================

// Server time minus UTC, rounded to 15 minutes.
long ServerUtcOffset()
{
   double off = (double)((long)TimeTradeServer() - (long)TimeGMT());
   return (long)(MathRound(off / 900.0) * 900.0);
}

string IsoUtc(const long utcSeconds)
{
   MqlDateTime t;
   TimeToStruct((datetime)utcSeconds, t);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", t.year, t.mon, t.day, t.hour, t.min, t.sec);
}

string JsonEscape(string text)
{
   StringReplace(text, "\\", "\\\\");
   StringReplace(text, "\"", "\\\"");
   StringReplace(text, "\r", " ");
   StringReplace(text, "\n", " ");
   StringReplace(text, "\t", " ");
   return text;
}

string NumOrNull(const bool has, const double value, const int digits)
{
   if(!has) return "null";
   return DoubleToString(value, MathMax(0, MathMin(digits, 6)));
}

// GET helper. Returns the HTTP status, body in out.
int HttpGet(const string url, string &out)
{
   char   noData[];
   char   res[];
   string resHeaders;
   ResetLastError();
   int code = WebRequest("GET", url, "", InpTimeout, noData, res, resHeaders);
   if(code == -1)
   {
      PrintFormat("[NEWS] GET failed. Error=%d url=%s", GetLastError(), url);
      return -1;
   }
   out = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   return code;
}

// POST helper. Returns the HTTP status, body in out.
int HttpPostJson(const string url, const string payload, string &out, const bool verbose = true, const int timeoutMs = 15000)
{
   char   req[];
   char   res[];
   string resHeaders;
   StringToCharArray(payload, req, 0, StringLen(payload), CP_UTF8);
   int size = ArraySize(req);
   if(size > 0 && req[size - 1] == 0) ArrayResize(req, size - 1);
   ResetLastError();
   int code = WebRequest("POST", url, "Content-Type: application/json\r\n", timeoutMs, req, res, resHeaders);
   if(code == -1)
   {
      if(verbose) PrintFormat("[NEWS] POST failed. Error=%d url=%s", GetLastError(), url);
      return -1;
   }
   out = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   return code;
}

// Read the MT5 economic calendar for [fromUtc, toUtc] and POST it to the server.
bool SendWeekNews(const long fromUtc, const long toUtc)
{
   long off = ServerUtcOffset();
   datetime fromServer = (datetime)(fromUtc + off);
   datetime toServer   = (datetime)(toUtc + off);

   MqlCalendarValue values[];
   ResetLastError();
   int total = CalendarValueHistory(values, fromServer, toServer, NULL, NULL);
   if(total < 0)
   {
      PrintFormat("[NEWS] CalendarValueHistory failed. Error=%d", GetLastError());
      return false;
   }
   if(total == 0)
   {
      Print("[NEWS] Calendar returned 0 events (calendar may still be syncing). Will retry.");
      return false;
   }

   string wanted = InpNewsCurrencies;
   StringReplace(wanted, " ", "");
   StringToUpper(wanted);
   string wantedList = "," + wanted + ",";

   string events = "";
   int count = 0;
   for(int i = 0; i < total; i++)
   {
      MqlCalendarEvent   ev;
      MqlCalendarCountry co;
      if(!CalendarEventById(values[i].event_id, ev))   continue;
      if(!CalendarCountryById(ev.country_id, co))      continue;

      if(StringLen(wanted) > 0 && StringFind(wantedList, "," + co.currency + ",") == -1) continue;

      int level = 0;
      string importance = "none";
      if(ev.importance == CALENDAR_IMPORTANCE_LOW)           { level = 1; importance = "low"; }
      else if(ev.importance == CALENDAR_IMPORTANCE_MODERATE) { level = 2; importance = "medium"; }
      else if(ev.importance == CALENDAR_IMPORTANCE_HIGH)     { level = 3; importance = "high"; }
      if(level < InpNewsMinImportance) continue;

      long utc = (long)values[i].time - off;
      int  dg  = (int)ev.digits;

      if(count > 0) events += ",";
      events += "{";
      events += "\"id\":"          + IntegerToString((long)values[i].id)               + ",";
      events += "\"time\":"        + IntegerToString(utc)                              + ",";
      events += "\"iso\":\""       + IsoUtc(utc)                                       + "\",";
      events += "\"country\":\""   + JsonEscape(co.name)                               + "\",";
      events += "\"currency\":\""  + JsonEscape(co.currency)                           + "\",";
      events += "\"event\":\""     + JsonEscape(ev.name)                               + "\",";
      events += "\"importance\":\""+ importance                                        + "\",";
      events += "\"actual\":"      + NumOrNull(values[i].HasActualValue(),   values[i].GetActualValue(),   dg) + ",";
      events += "\"forecast\":"    + NumOrNull(values[i].HasForecastValue(), values[i].GetForecastValue(), dg) + ",";
      events += "\"previous\":"    + NumOrNull(values[i].HasPreviousValue(), values[i].GetPreviousValue(), dg);
      events += "}";
      count++;
   }

   string payload = "{";
   payload += "\"symbol\":\""   + _Symbol                 + "\",";
   payload += "\"week_start\":" + IntegerToString(fromUtc) + ",";
   payload += "\"week_end\":"   + IntegerToString(toUtc)   + ",";
   payload += "\"count\":"      + IntegerToString(count)   + ",";
   payload += "\"events\":["    + events                   + "]}";

   string body;
   int code = HttpPostJson(InpNewsBaseUrl + "/api/v1/trading/collectWeeklyNEWS", payload, body);
   if(code != 200)
   {
      PrintFormat("[NEWS] Server rejected the news. HTTP %d : %s", code, body);
      return false;
   }
   PrintFormat("[NEWS] Sent %d events (of %d in calendar) for the week.", count, total);
   return true;
}

// Monday 00:00 UTC -> Sunday 23:59:59 UTC of the current week, then send it.
void SendThisWeekNews()
{
   long nowUtc = (long)TimeGMT();
   MqlDateTime t;
   TimeToStruct((datetime)nowUtc, t);
   int  back    = (t.day_of_week + 6) % 7;             // days since Monday (Sunday = 0 in MQL5)
   long fromUtc = (nowUtc - (nowUtc % 86400)) - (long)back * 86400;
   long toUtc   = fromUtc + 7 * 86400 - 1;
   PrintFormat("[NEWS] Sending week %s -> %s", IsoUtc(fromUtc), IsoUtc(toUtc));
   SendWeekNews(fromUtc, toUtc);
}

//====================================================================
//  LIVE CHART
//====================================================================

// The EA's open position on this symbol as JSON (open_time in UTC).
string PositionJson(const long off)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(!pos.SelectByIndex(i))    continue;
      if(pos.Magic()  != InpMagic) continue;
      if(pos.Symbol() != _Symbol)  continue;
      string type = (pos.PositionType() == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      return "{\"type\":\""      + type                                              + "\","
           + "\"lots\":"         + DoubleToString(pos.Volume(), 2)                   + ","
           + "\"open_price\":"   + DoubleToString(pos.PriceOpen(), _Digits)          + ","
           + "\"open_time\":"    + IntegerToString((long)pos.Time() - off)           + ","
           + "\"profit\":"       + DoubleToString(pos.Profit() + pos.Swap(), 2)      + "}";
   }
   return "{\"type\":\"NONE\"}";
}

// The trading account as JSON (balance / equity come straight from MT5).
string AccountJson()
{
   return "{\"login\":\""    + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN))        + "\","
        + "\"name\":\""      + JsonEscape(AccountInfoString(ACCOUNT_NAME))                    + "\","
        + "\"server\":\""    + JsonEscape(AccountInfoString(ACCOUNT_SERVER))                  + "\","
        + "\"currency\":\""  + JsonEscape(AccountInfoString(ACCOUNT_CURRENCY))                + "\","
        + "\"leverage\":"     + IntegerToString((long)AccountInfoInteger(ACCOUNT_LEVERAGE))     + ","
        + "\"balance\":"      + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)           + ","
        + "\"equity\":"       + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)            + ","
        + "\"margin\":"       + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN), 2)            + ","
        + "\"free_margin\":"  + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2)       + "}";
}

// Store every new tick (called from OnTick).
void CaptureTick()
{
   MqlTick t;
   if(!SymbolInfoTick(_Symbol, t)) return;
   if(t.time_msc <= g_lastTickMsc)  return;
   g_lastTickMsc = t.time_msc;

   if(ArraySize(g_tickMsc) == 0)
   {
      ArrayResize(g_tickMsc, TICK_BUF);
      ArrayResize(g_tickBid, TICK_BUF);
      ArrayResize(g_tickAsk, TICK_BUF);
   }
   if(g_tickN >= TICK_BUF)   // buffer full : drop the oldest 10%
   {
      int drop = TICK_BUF / 10;
      for(int i = drop; i < g_tickN; i++)
      {
         g_tickMsc[i - drop] = g_tickMsc[i];
         g_tickBid[i - drop] = g_tickBid[i];
         g_tickAsk[i - drop] = g_tickAsk[i];
      }
      g_tickN -= drop;
   }
   g_tickMsc[g_tickN] = t.time_msc;
   g_tickBid[g_tickN] = t.bid;
   g_tickAsk[g_tickN] = t.ask;
   g_tickN++;
}

// Remove the first n ticks (they were saved by the server).
void DropTicks(const int n)
{
   if(n <= 0) return;
   if(n >= g_tickN) { g_tickN = 0; return; }
   for(int i = n; i < g_tickN; i++)
   {
      g_tickMsc[i - n] = g_tickMsc[i];
      g_tickBid[i - n] = g_tickBid[i];
      g_tickAsk[i - n] = g_tickAsk[i];
   }
   g_tickN -= n;
}

string ExitReasonName(const long reason)
{
   switch((int)reason)
   {
      case DEAL_REASON_SL:     return "SL";
      case DEAL_REASON_TP:     return "TP";
      case DEAL_REASON_SO:     return "STOP_OUT";
      case DEAL_REASON_EXPERT: return "EA";
      case DEAL_REASON_CLIENT:
      case DEAL_REASON_MOBILE:
      case DEAL_REASON_WEB:    return "MANUAL";
   }
   return "OTHER";
}

// Send the trades of this EA that were closed since the last sync.
void SendClosedTrades()
{
   string gvName = "VSPL_TRSYNC_" + IntegerToString(InpMagic) + "_" + _Symbol;
   datetime from = 0;
   if(GlobalVariableCheck(gvName)) from = (datetime)(long)GlobalVariableGet(gvName);
   if(from <= 0) from = TimeCurrent() - (datetime)(MathMax(1, InpTradeSyncDays) * 86400);

   //--- phase 1 : position ids that were closed since "from"
   if(!HistorySelect(from, TimeCurrent() + 86400)) return;
   long ids[];
   int  idN = 0;
   int  total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong tk = HistoryDealGetTicket(i);
      if(tk == 0) continue;
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) continue;
      if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol) continue;
      long pid = HistoryDealGetInteger(tk, DEAL_POSITION_ID);
      bool known = false;
      for(int k = 0; k < idN; k++) if(ids[k] == pid) { known = true; break; }
      if(known) continue;
      ArrayResize(ids, idN + 1);
      ids[idN++] = pid;
   }
   if(idN == 0) return;

   //--- phase 2 : entry + exit of each position
   long     off     = ServerUtcOffset();
   string   trades  = "";
   int      count   = 0;
   datetime maxExit = from;

   for(int n = 0; n < idN; n++)
   {
      if(!HistorySelectByPosition((ulong)ids[n])) continue;
      int dt = HistoryDealsTotal();

      ulong    inTk = 0, outTk = 0;
      double   profit = 0, swap = 0, comm = 0;
      for(int i = 0; i < dt; i++)
      {
         ulong tk = HistoryDealGetTicket(i);
         if(tk == 0) continue;
         long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
         profit += HistoryDealGetDouble(tk, DEAL_PROFIT);
         swap   += HistoryDealGetDouble(tk, DEAL_SWAP);
         comm   += HistoryDealGetDouble(tk, DEAL_COMMISSION) + HistoryDealGetDouble(tk, DEAL_FEE);
         if(entry == DEAL_ENTRY_IN && inTk == 0) inTk = tk;
         if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT) outTk = tk;
      }
      if(inTk == 0 || outTk == 0) continue;
      if(HistoryDealGetInteger(inTk, DEAL_MAGIC) != InpMagic) continue;   // not a trade of this EA

      datetime exitT = (datetime)HistoryDealGetInteger(outTk, DEAL_TIME);
      if(exitT > maxExit) maxExit = exitT;

      string type = (HistoryDealGetInteger(inTk, DEAL_TYPE) == DEAL_TYPE_BUY) ? "BUY" : "SELL";
      string t = "{";
      t += "\"ticket\":\""     + IntegerToString(ids[n])                                    + "\",";
      t += "\"symbol\":\""     + _Symbol                                                    + "\",";
      t += "\"type\":\""       + type                                                       + "\",";
      t += "\"lots\":"         + DoubleToString(HistoryDealGetDouble(inTk, DEAL_VOLUME), 2) + ",";
      t += "\"entry_time\":"   + IntegerToString((long)HistoryDealGetInteger(inTk, DEAL_TIME) - off) + ",";
      t += "\"entry_price\":"  + DoubleToString(HistoryDealGetDouble(inTk, DEAL_PRICE), _Digits) + ",";
      t += "\"exit_time\":"    + IntegerToString((long)exitT - off)                         + ",";
      t += "\"exit_price\":"   + DoubleToString(HistoryDealGetDouble(outTk, DEAL_PRICE), _Digits) + ",";
      t += "\"profit\":"       + DoubleToString(profit, 2)                                  + ",";
      t += "\"swap\":"         + DoubleToString(swap, 2)                                    + ",";
      t += "\"commission\":"   + DoubleToString(comm, 2)                                    + ",";
      t += "\"exit_reason\":\"" + ExitReasonName(HistoryDealGetInteger(outTk, DEAL_REASON)) + "\",";
      t += "\"comment\":\""    + JsonEscape(HistoryDealGetString(inTk, DEAL_COMMENT))        + "\"}";

      if(count > 0) trades += ",";
      trades += t;
      count++;
   }

   if(count == 0)
   {
      if(TimeLocal() - g_lastTradeLog >= 60)
      {
         g_lastTradeLog = TimeLocal();
         PrintFormat("[TRADES] %d closed position(s) found on %s but none belong to magic %d (or the entry deal is missing). Nothing sent.", idN, _Symbol, InpMagic);
      }
      GlobalVariableSet(gvName, (double)maxExit);
      return;
   }

   string payload = "{\"symbol\":\"" + _Symbol + "\",\"trades\":[" + trades + "]}";
   string body;
   int code = HttpPostJson(InpNewsBaseUrl + "/api/v1/trading/liveTrades", payload, body, false, 5000);
   if(code != 200)
   {
      if(TimeLocal() - g_lastTradeErr >= 30)
      {
         g_lastTradeErr = TimeLocal();
         PrintFormat("[TRADES] Send failed. HTTP %d %s", code, body);
      }
      return;   // watermark not moved : sent again next time (the server ignores duplicates)
   }
   GlobalVariableSet(gvName, (double)maxExit);   // exit time is kept (>=) so a trade closed in the same second is never missed
   PrintFormat("[TRADES] Sent %d closed trade(s) to the server (HTTP 200)", count);
}

// Push the forming candle (and the last closed one) to the server. Full history when asked.
void SendLive()
{
   MqlRates rates[];
   ArraySetAsSeries(rates, false);                       // index 0 = oldest
   int want   = g_needHistory ? MathMax(10, InpLiveHistory) : 2;
   int copied = CopyRates(_Symbol, _Period, 0, want, rates);   // shift 0 = forming candle
   if(copied <= 0) return;

   long   off = ServerUtcOffset();
   string tf  = EnumToString(_Period);
   StringReplace(tf, "PERIOD_", "");

   string candles = "";
   for(int i = 0; i < copied; i++)
   {
      if(i > 0) candles += ",";
      candles += "{";
      candles += "\"time\":"   + IntegerToString((long)rates[i].time - off)  + ",";   // UTC seconds
      candles += "\"open\":"   + DoubleToString(rates[i].open,  _Digits)     + ",";
      candles += "\"high\":"   + DoubleToString(rates[i].high,  _Digits)     + ",";
      candles += "\"low\":"    + DoubleToString(rates[i].low,   _Digits)     + ",";
      candles += "\"close\":"  + DoubleToString(rates[i].close, _Digits)     + ",";
      candles += "\"volume\":" + IntegerToString((long)rates[i].tick_volume);
      candles += "}";
   }

   int sendTicks = MathMin(g_tickN, TICK_SEND);
   string ticks = "";
   for(int i = 0; i < sendTicks; i++)
   {
      if(i > 0) ticks += ",";
      ticks += "{\"t\":" + IntegerToString(g_tickMsc[i] - off * 1000) + ",\"b\":" + DoubleToString(g_tickBid[i], _Digits)
             + ",\"a\":" + DoubleToString(g_tickAsk[i], _Digits) + "}";
   }

   string payload = "{";
   payload += "\"symbol\":\""    + _Symbol                                              + "\",";
   payload += "\"timeframe\":\"" + tf                                                   + "\",";
   payload += "\"digits\":"      + IntegerToString(_Digits)                             + ",";
   payload += "\"bid\":"         + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_BID), _Digits) + ",";
   payload += "\"ask\":"         + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_ASK), _Digits) + ",";
   payload += "\"history\":"     + (g_needHistory ? "true" : "false")                   + ",";
   payload += "\"position\":"    + PositionJson(off)                                    + ",";
   payload += "\"account\":"     + AccountJson()                                        + ",";
   payload += "\"candles\":["    + candles                                              + "],";
   payload += "\"ticks\":["      + ticks                                                + "]}";

   string body;
   int code = HttpPostJson(InpNewsBaseUrl + "/api/v1/trading/liveCandles", payload, body, false, 2000);
   if(code != 200)
   {
      if(TimeLocal() - g_lastLiveErr >= 30)   // do not flood the log
      {
         g_lastLiveErr = TimeLocal();
         PrintFormat("[LIVE] Push failed. HTTP %d %s (Error=%d)", code, body, GetLastError());
      }
      g_needHistory = true;   // after an outage the server needs the history again
      return;
   }
   DropTicks(sendTicks);   // the server saved them
   g_needHistory = ParseBool(body, "need_history");
}

//====================================================================
int OnInit()
{
   if(MQLInfoInteger(MQL_TESTER))
   {
      Alert("WebRequest is not available in the Strategy Tester. Use the Back Testing page of the web app on the CSV datasets instead.");
      return INIT_FAILED;
   }

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFillingBySymbol(_Symbol);
   
   EventSetTimer(1);   // OnTimer() runs every second (live push + news schedule are counted inside)

   Print("=== VSPL XAUUSD bot v2.70 started ===");
   PrintFormat("    News     : %s (every %d s, currencies=%s, min importance=%d)",
               InpNewsBaseUrl, InpNewsSendSeconds, StringLen(InpNewsCurrencies) > 0 ? InpNewsCurrencies : "ALL", InpNewsMinImportance);
   PrintFormat("    Controls : news stop + app buttons checked every %d s (news: trades closed 15 minutes before to 15 minutes after an event)", InpControlCheckSeconds);
   PrintFormat("    Live     : %s (every %d s, history %d candles)",
               InpLiveEnabled ? "ON" : "OFF", InpLiveSeconds, InpLiveHistory);
   PrintFormat("    Trades   : sync every %d s (first run: last %d days)", InpTradeSyncSeconds, InpTradeSyncDays);
   PrintFormat("    Endpoint : %s", InpApiUrl);
   PrintFormat("    Chart    : %s %s | Candles: %d | Lots: %.2f | Magic: %d", _Symbol, EnumToString(_Period), InpCandles, InpLots, InpMagic);
   SendThisWeekNews();   // first send now, then every InpNewsSendSeconds from OnTimer
   g_lastNews = TimeLocal();

   Print("    NOTE: add the server URL under Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("=== VSPL XAUUSD bot stopped ===");
}

//====================================================================
//  News stop : asks the server if we are inside the 30 minute news window.
//  Inside it, every open trade of this EA is closed (again on every check until it is really closed).
//====================================================================
void CheckNewsStop()
{
   string body;
   int code = HttpGet(InpNewsBaseUrl + "/api/v1/trading/newsStatus", body);
   if(code != 200) return;   // server not reachable : keep the last known state

   bool blackout = ParseBool(body, "blackout");

   if(blackout != g_newsBlackout)
   {
      g_newsBlackout = blackout;
      if(blackout) PrintFormat("[NEWS] Trading stopped until %s UTC : %s %s",
                               TimeToString((datetime)StringToInteger(ParseNumber(body, "endsAt")), TIME_DATE | TIME_MINUTES),
                               ParseString(body, "currency"), ParseString(body, "name"));
      else         Print("[NEWS] News window finished. Trading is allowed again from the next candle.");
   }

   if(blackout && CurrentPositionName() != "NONE")
   {
      Print("[NEWS] Closing the open trade because of the news window");
      CloseAll();
   }
}

//====================================================================
//  Manual controls from the app : Trading ON/OFF and Close trade.
//====================================================================
void CheckManualControls()
{
   string body;
   int code = HttpGet(InpNewsBaseUrl + "/api/v1/trading/botControl", body);
   if(code != 200) return;   // server not reachable : keep the last known state

   //--- Trading ON / OFF
   bool enabled = ParseBool(body, "tradingEnabled");
   if(enabled != g_tradingEnabled)
   {
      g_tradingEnabled = enabled;
      Print(enabled ? "[CONTROL] Trading is ON" : "[CONTROL] Trading is OFF : no new trade will be opened");
   }

   //--- Close trade : a new number means the button was pressed
   long closeRequestId = StringToInteger(ParseNumber(body, "closeRequestId"));
   if(g_lastCloseRequestId < 0) { g_lastCloseRequestId = closeRequestId; return; }   // first read after start : nothing to do
   if(closeRequestId == g_lastCloseRequestId) return;

   g_lastCloseRequestId = closeRequestId;
   if(CurrentPositionName() == "NONE") return;

   Print("[CONTROL] Close trade pressed in the app : closing the open trade");
   CloseAll();
}

//====================================================================
//  OnTimer - runs every second
//    - news stop + manual controls check every InpControlCheckSeconds
//    - live chart push every InpLiveSeconds
//    - weekly news every InpNewsSendSeconds
//====================================================================
void OnTimer()
{
   if((TimeLocal() - g_lastNewsCheck) >= MathMax(1, InpControlCheckSeconds))
   {
      g_lastNewsCheck = TimeLocal();
      CheckNewsStop();
      CheckManualControls();
   }

   if(InpLiveEnabled && (TimeLocal() - g_lastLive) >= MathMax(1, InpLiveSeconds))
   {
      g_lastLive = TimeLocal();
      SendLive();
   }

   if(InpLiveEnabled && (TimeLocal() - g_lastTradeSync) >= MathMax(5, InpTradeSyncSeconds))
   {
      g_lastTradeSync = TimeLocal();
      SendClosedTrades();
   }

   if((TimeLocal() - g_lastNews) >= MathMax(5, InpNewsSendSeconds))
   {
      g_lastNews = TimeLocal();
      SendThisWeekNews();
   }
}

//====================================================================
//  OnTick - the work happens once per new candle
//====================================================================
void OnTick()
{
   //--- every real tick goes into the buffer (sent with the live push)
   if(InpLiveEnabled) CaptureTick();

   //--- one decision per candle (set only after a successful reply, so a failed call is retried)
   datetime barTime = iTime(_Symbol, _Period, 0);
   if(barTime == g_lastBar) return;

   //--- back off after a failed call
   if(g_lastTryMs != 0 && (GetTickCount() - g_lastTryMs) < (uint)(InpRetrySecs * 1000)) return;

   string current = CurrentPositionName();
   if(current == "BOTH") { CloseAll(); current = CurrentPositionName(); }

   string payload = BuildPayload(current);
   if(payload == "") { g_lastTryMs = GetTickCount(); return; }

   string response = CallApi(payload);
   if(response == "") { g_lastTryMs = GetTickCount(); return; }
   g_lastTryMs = 0;

   //--- read the answer
   string target   = ParseString(response, "target_position");   // BUY | SELL | FLAT
   string reason   = ParseString(response, "reason");
   bool   stBull   = ParseBool(response, "st_bull");
   bool   htBull   = ParseBool(response, "ht_bull");
   string adxValue = ParseNumber(response, "adx");

   if(target != "BUY" && target != "SELL" && target != "FLAT")
   {
      PrintFormat("[API ERROR] Unexpected reply: %s", response);
      g_lastTryMs = GetTickCount();
      return;
   }

   //--- safety : trading OFF in the app means no new trade (an open trade is left alone)
   if(!g_tradingEnabled && target != "FLAT" && CurrentPositionName() == "NONE") { target = "FLAT"; reason = "trading_stopped"; }

   //--- safety : never open a trade inside the news window, even if the reply is older than the news check
   if(g_newsBlackout && target != "FLAT") { target = "FLAT"; reason = "news_blackout"; }

   PrintFormat("[SIGNAL] ST=%s | HT=%s | ADX=%s | position=%s -> target=%s (%s)",
               stBull ? "BULL" : "BEAR", htBull ? "BULL" : "BEAR", adxValue, current, target, reason);

   //--- make the position equal to the target
   string wanted = (target == "FLAT") ? "NONE" : target;
   if(wanted != current)
   {
      if(current != "NONE")
      {
         PrintFormat("[EXIT] Closing %s (%s)", current, reason);
         if(!CloseAll()) { g_lastTryMs = GetTickCount(); return; }   // retry the whole step on the next tick
      }
      if(target == "BUY")  { PrintFormat("[ENTRY] BUY (%s)", reason);  OpenBuy();  }
      if(target == "SELL") { PrintFormat("[ENTRY] SELL (%s)", reason); OpenSell(); }
   }

   g_lastBar = barTime;
}
//+------------------------------------------------------------------+
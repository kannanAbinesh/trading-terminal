/* Numbers shown at the top of a back test result. */
const { round } = require('./csv');

const summarizeTrades = (trades, equity, initialBalance) => {

    const wins = trades.filter((trade) => trade.pnl >= 0);
    const losses = trades.filter((trade) => trade.pnl < 0);
    const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
    const netProfit = grossProfit - grossLoss;

    let peak = initialBalance, maxDrawdown = 0, maxDrawdownPct = 0;
    equity.forEach(([, value]) => {
        if (value > peak) peak = value;
        const drawdown = peak - value;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        if (peak > 0 && drawdown / peak * 100 > maxDrawdownPct) maxDrawdownPct = drawdown / peak * 100;
    });

    let streak = 0, maxLossStreak = 0;
    trades.forEach((trade) => { streak = trade.pnl < 0 ? streak + 1 : 0; if (streak > maxLossStreak) maxLossStreak = streak; });

    return {
        totalTrades: trades.length,
        buyTrades: trades.filter((trade) => trade.type === 'BUY').length,
        sellTrades: trades.filter((trade) => trade.type === 'SELL').length,
        wins: wins.length,
        losses: losses.length,
        winRate: trades.length ? round(wins.length / trades.length * 100, 2) : 0,
        netProfit: round(netProfit, 2),
        grossProfit: round(grossProfit, 2),
        grossLoss: round(grossLoss, 2),
        profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 2) : null,
        avgWin: wins.length ? round(grossProfit / wins.length, 2) : 0,
        avgLoss: losses.length ? round(-grossLoss / losses.length, 2) : 0,
        bestTrade: trades.length ? Math.max(...trades.map((trade) => trade.pnl)) : 0,
        worstTrade: trades.length ? Math.min(...trades.map((trade) => trade.pnl)) : 0,
        maxLossStreak,
        maxDrawdown: round(maxDrawdown, 2),
        maxDrawdownPct: round(maxDrawdownPct, 2),
        initialBalance,
        finalBalance: round(initialBalance + netProfit, 2),
        returnPct: round(netProfit / initialBalance * 100, 2)
    };
};

module.exports = { summarizeTrades };

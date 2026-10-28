'use strict';
/*
 * ASM monthly allowance pool. Money is always integer kuruş.
 * In pool mode, every doctor receives an equal share of the remainder,
 * independent of individual allowance deposits and of expense split metadata.
 */
window.ASMAllowanceMath = (() => {
  function analyze(ledger, selectedMonth) {
    const doctors = ledger.doctors || [];
    const ids = new Set(doctors.map(d => d.id));
    const entries = (ledger.allowances || []).filter(a => a.month === selectedMonth && ids.has(a.doctorId));
    const received = new Map(entries.map(a => [a.doctorId, a.amount]));
    const active = entries.length > 0;
    const missing = doctors.filter(d => !received.has(d.id));
    const complete = active && doctors.length > 0 && missing.length === 0;
    const expenses = (ledger.expenses || []).filter(e => e.date.slice(0, 7) === selectedMonth);
    const totalAllowance = entries.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    const remainder = totalAllowance - totalExpenses;
    const paid = Object.fromEntries(doctors.map(d => [d.id, 0]));
    for (const expense of expenses) paid[expense.paidBy] = (paid[expense.paidBy] || 0) + expense.amount;
    // Floor plus remainder produces exact, deterministic integer-kuruş shares,
    // including when a month's total is negative.
    const base = complete ? Math.floor(remainder / doctors.length) : null;
    const extra = complete ? remainder - (base * doctors.length) : 0;
    const movements = (ledger.transfers || []).filter(t => t.month === selectedMonth);
    const perDoctor = doctors.map((doctor, index) => {
      const allowance = received.get(doctor.id) ?? null;
      const spent = paid[doctor.id] || 0;
      const cash = allowance === null ? null : allowance - spent;
      const target = complete ? base + (index < extra ? 1 : 0) : null;
      const transferredOut = movements.filter(t => t.from === doctor.id).reduce((sum,t)=>sum+t.amount,0);
      const transferredIn = movements.filter(t => t.to === doctor.id).reduce((sum,t)=>sum+t.amount,0);
      // Positive balance = money to RECEIVE; negative = money to SEND.
      const balance = complete ? target - cash + transferredOut - transferredIn : null;
      return {id:doctor.id,name:doctor.name,allowance,spent,cash,target,balance};
    });
    return {
      active,complete,missing,recordedCount:entries.length,doctorCount:doctors.length,
      totalAllowance,totalExpenses,remainder,baseShare:base,
      perDoctor
    };
  }
  return {analyze};
})();

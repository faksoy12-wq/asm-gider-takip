'use strict';
/*
 * Monthly allowance pool, in integer kuruş. An explicit amount entered for one
 * month automatically carries forward until that doctor records an override.
 * This is a projected default, not a background database write. On the first
 * edit in a future month, snapshotting inherited amounts makes that month's
 * recorded values independent from future corrections to earlier months.
 */
window.ASMAllowanceMath = (() => {
  function effectiveAllowances(ledger, selectedMonth) {
    const doctors = ledger.doctors || [];
    const validIds = new Set(doctors.map(d => d.id));
    const current = new Map();
    const past = new Map();
    for (const entry of ledger.allowances || []) {
      if (!validIds.has(entry.doctorId)) continue;
      if (entry.month === selectedMonth) {
        current.set(entry.doctorId, entry);
      } else if (entry.month < selectedMonth) {
        const earlier = past.get(entry.doctorId);
        if (!earlier || entry.month > earlier.month) past.set(entry.doctorId, entry);
      }
    }
    return doctors.map(doctor => {
      const own = current.get(doctor.id);
      const last = own || past.get(doctor.id);
      return {
        id: doctor.id,
        name: doctor.name,
        allowance: last ? last.amount : null,
        inherited: Boolean(last && (!own || own.copiedFrom)),
        sourceMonth: own?.copiedFrom || (own ? own.month : last?.month ?? null),
        explicit: Boolean(own && !own.copiedFrom),
        stored: Boolean(own)
      };
    });
  }

  function snapshotInherited(ledger, selectedMonth) {
    // Call only as part of an existing user-initiated save. Never write from a
    // view/render or from automatic refresh, and never create duplicate rows.
    return effectiveAllowances(ledger, selectedMonth)
      .filter(d => d.inherited && !d.stored)
      .map(d => ({doctorId: d.id, month: selectedMonth, amount: d.allowance, copiedFrom: d.sourceMonth}));
  }

  function analyze(ledger, selectedMonth) {
    const doctors = ledger.doctors || [];
    const effective = effectiveAllowances(ledger, selectedMonth);
    const received = new Map(effective.map(d => [d.id, d]));
    const recordedCount = effective.filter(d => d.allowance !== null).length;
    const explicitCount = effective.filter(d => d.explicit).length;
    const inheritedCount = effective.filter(d => d.inherited).length;
    const active = recordedCount > 0;
    const missing = effective.filter(d => d.allowance === null);
    const complete = active && doctors.length > 0 && missing.length === 0;
    const expenses = (ledger.expenses || []).filter(e => e.date.slice(0, 7) === selectedMonth);
    const totalAllowance = effective.reduce((sum, d) => sum + (d.allowance ?? 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const remainder = totalAllowance - totalExpenses;
    const paid = Object.fromEntries(doctors.map(d => [d.id, 0]));
    for (const e of expenses) paid[e.paidBy] = (paid[e.paidBy] || 0) + e.amount;
    const base = complete ? Math.floor(remainder / doctors.length) : null;
    const extra = complete ? remainder - base * doctors.length : 0;
    const movements = (ledger.transfers || []).filter(t => t.month === selectedMonth);
    const perDoctor = doctors.map((doctor, index) => {
      const item = received.get(doctor.id);
      const allowance = item.allowance;
      const spent = paid[doctor.id] || 0;
      const cash = allowance === null ? null : allowance - spent;
      const target = complete ? base + (index < extra ? 1 : 0) : null;
      const sent = movements.filter(t => t.from === doctor.id).reduce((s, t) => s + t.amount, 0);
      const receivedTransfer = movements.filter(t => t.to === doctor.id).reduce((s, t) => s + t.amount, 0);
      // Positive = money owed TO this doctor; negative = doctor should SEND.
      const balance = complete ? target - cash + sent - receivedTransfer : null;
      return {id: doctor.id, name: doctor.name, allowance, spent, cash,
        target, balance, inherited: item.inherited, sourceMonth: item.sourceMonth,
        explicit: item.explicit, stored: item.stored};
    });
    return {active, complete, missing, recordedCount, explicitCount,
      inheritedCount, doctorCount: doctors.length, totalAllowance,
      totalExpenses, remainder, baseShare: base, perDoctor};
  }
  return {analyze, effectiveAllowances, snapshotInherited};
})();

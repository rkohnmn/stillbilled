// The billing rhythms Stillbilled looks for.
//
// `unit` is how the gap is measured: fixed day counts for weekly rhythms,
// calendar months for the rest (a "monthly" charge is 28 to 31 days apart, so
// counting days would be wrong). `tol` is how many days late or early a charge
// may land and still count, to absorb weekends, bank holidays and processing delays.
// `perYear` converts one charge into a yearly cost.

export const CADENCES = [
  { id: 'weekly', label: 'Weekly', unit: 'days', every: 7, tol: 1, perYear: 365.25 / 7, minCharges: 4 },
  { id: 'biweekly', label: 'Every 2 weeks', unit: 'days', every: 14, tol: 2, perYear: 365.25 / 14, minCharges: 3 },
  { id: 'monthly', label: 'Monthly', unit: 'months', every: 1, tol: 4, perYear: 12, minCharges: 2 },
  { id: 'bimonthly', label: 'Every 2 months', unit: 'months', every: 2, tol: 5, perYear: 6, minCharges: 2 },
  { id: 'quarterly', label: 'Quarterly', unit: 'months', every: 3, tol: 6, perYear: 4, minCharges: 2 },
  { id: 'semiannual', label: 'Every 6 months', unit: 'months', every: 6, tol: 9, perYear: 2, minCharges: 2 },
  { id: 'annual', label: 'Yearly', unit: 'months', every: 12, tol: 10, perYear: 1, minCharges: 2 },
];

export const AVG_MONTH_DAYS = 30.4375;
export const cadenceById = (id) => CADENCES.find((c) => c.id === id);

/** Approximate length of one cycle in days. */
export const periodDays = (cad) => (cad.unit === 'days' ? cad.every : cad.every * AVG_MONTH_DAYS);

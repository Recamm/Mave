import { parseDecimal } from './decimal';

export function formatMoney(amount: string, currency: string): string {
  const [whole, fraction] = parseDecimal(amount).toFixed(2).split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${currency} ${groupedWhole},${fraction}`;
}

export function formatCivilDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

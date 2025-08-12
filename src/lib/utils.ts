import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date, longYear?: boolean): string {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  const options: Intl.DateTimeFormatOptions = {
    year: longYear ? 'numeric' : '2-digit',
    month: '2-digit',
    day: '2-digit',
  };
  return date.toLocaleDateString('en-US', options);
}

export function formatNumber(input: number): string {
  return input.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// eslint-disable-next-line
export function debounce(func: (...args: any[]) => void, wait: number) {
  let timeout: NodeJS.Timeout;
  // eslint-disable-next-line
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
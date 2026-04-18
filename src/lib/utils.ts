import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina classes com clsx e resolve conflitos do Tailwind com twMerge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formata um valor numérico como moeda brasileira: R$ 1.234,56
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Formata um número como percentual: 12,34%
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Formata uma string ISO de data para o formato DD/MM/AAAA HH:MM
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Retorna uma classe de cor Tailwind baseada no percentual de uso.
 * Verde (<75%), Laranja (75-90%), Vermelho (>90%).
 */
export function getUsageColor(percent: number): string {
  if (percent > 90) return "text-red-500";
  if (percent >= 75) return "text-orange-500";
  return "text-green-500";
}

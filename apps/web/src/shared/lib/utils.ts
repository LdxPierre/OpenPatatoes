import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combine des classes Tailwind ; en cas de conflit, la dernière gagne. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

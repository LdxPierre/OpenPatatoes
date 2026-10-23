import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Alert } from './Alert.vue'
export { default as AlertDescription } from './AlertDescription.vue'
export { default as AlertTitle } from './AlertTitle.vue'

export const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        // Fond teinté sans bordure visible, couleurs des familles d'état.
        neutral: 'border-transparent bg-muted text-foreground',
        info: 'border-transparent bg-info text-info-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        warn: 'border-transparent bg-warn text-warn-foreground',
        error: 'border-transparent bg-error text-error-foreground',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

export type AlertVariants = VariantProps<typeof alertVariants>

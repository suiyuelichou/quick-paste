import type { QuickPasteApi } from '../../shared/types'

declare global {
  namespace JSX {
    type Element = import('react').JSX.Element
  }
  interface Window { quickPaste: QuickPasteApi }
}

export {}

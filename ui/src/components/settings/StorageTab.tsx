import React from 'react'
import { TabsContent } from '../ui/tabs'
import { StorageSettings } from '../StorageSettings'
import { TabTransition } from './SettingsPrimitives'

interface StorageTabProps {
  matches: (keywords: string[]) => boolean
}

export const StorageTab: React.FC<StorageTabProps> = ({ matches }) => {
  return (
    <TabsContent value="storage" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
      <TabTransition>
        {matches(['storage', 'armazenamento', 'disco', 'diretório', 'drive', 'pasta', 'caminho', 'nuvem']) && (
          <StorageSettings />
        )}
      </TabTransition>
    </TabsContent>
  )
}

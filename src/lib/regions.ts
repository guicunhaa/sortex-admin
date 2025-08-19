// src/lib/regions.ts
// Regiões (cidades) do RS com códigos curtos.
// Convenções pedidas: NH = Novo Hamburgo, ESL = São Leopoldo.

export type RegionOption = { code: string; label: string }

export const REGIONS: RegionOption[] = [
  { code: 'POA', label: 'Porto Alegre' },
  { code: 'CAN', label: 'Canoas' },
  { code: 'NH',  label: 'Novo Hamburgo' },
  { code: 'ESL', label: 'São Leopoldo' },
  { code: 'EST', label: 'Esteio' },
  { code: 'SAP', label: 'Sapucaia do Sul' },
  { code: 'GRV', label: 'Gravataí' },
  { code: 'ALV', label: 'Alvorada' },
  { code: 'VIA', label: 'Viamão' },
  { code: 'CB',  label: 'Campo Bom' },
  { code: 'SPG', label: 'Sapiranga' },
  { code: 'EV',  label: 'Estância Velha' },
  { code: 'IVT', label: 'Ivoti' },
  { code: 'PTN', label: 'Portão' },
  { code: 'TAQ', label: 'Taquara' },
  // pode adicionar mais cidades aqui mantendo o par { code, label }
]

// Helper para exibir o nome completo a partir do code
export function regionLabel(code?: string | null): string {
  if (!code) return ''
  const found = REGIONS.find(r => r.code === code)
  return found ? found.label : String(code)
}
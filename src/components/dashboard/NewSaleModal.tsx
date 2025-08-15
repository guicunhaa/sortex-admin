'use client'
import Modal from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import Field from '@/components/ui/form/Field'
import Label from '@/components/ui/form/Label'
import Input from '@/components/ui/form/Input'
import Select from '@/components/ui/form/Select'
import HelperText from '@/components/ui/form/HelperText'

const schema = z.object({
  number: z.string().min(1),
  vendorName: z.string().min(1),
  product: z.string().min(1),
  region: z.string().default(''),
  quantity: z.coerce.number().int().positive().default(1),
  total: z.coerce.number().nonnegative(),
  status: z.enum(['pago', 'pendente']),
  clientName: z.string().optional(),
  clientId: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function NewSaleModal({
  open, onClose, onCreated,
  initialNumber,
  createSale, // (payload)=>fetch('/api/sales/create'...)
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  initialNumber?: string
  createSale: (payload: any) => Promise<any>
}) {
  const { user } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  const { register, handleSubmit, formState:{ errors, isSubmitting }, reset } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        number: initialNumber ?? '',
        product: initialNumber ? `Número ${initialNumber}` : '',
        status: 'pago',
        quantity: 1,
      },
      values: initialNumber ? {
        number: initialNumber,
        product: `Número ${initialNumber}`,
        vendorName: user?.displayName ?? (user?.email ?? 'Vendedor'),
        region: '',
        quantity: 1,
        total: 0,
        status: 'pago',
        clientName: '',
        clientId: '',
      } : undefined
    })

  async function onSubmit(data: FormData) {
    setErr(null)
    try {
      await createSale({
        number: data.number,
        vendorName: data.vendorName,
        clientId: data.clientId || undefined,
        clientName: data.clientName || undefined,
        total: data.total,
        status: data.status,
        quantity: data.quantity,
        region: data.region,
        product: data.product,
      })
      reset()
      onCreated()
    } catch (e:any) {
      setErr(e.message ?? 'Erro ao salvar')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar venda">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Número</Label>
            <Input id="number" {...register('number')} readOnly error={!!errors.number} />
            {errors.number && <HelperText variant="error">{String(errors.number.message)}</HelperText>}
          </div>
          <div>
            <Label>Vendedor</Label>
            <Input id="vendorName" {...register('vendorName')} error={!!errors.vendorName} />
            {errors.vendorName && <HelperText variant="error">{String(errors.vendorName.message)}</HelperText>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Cliente (nome)</Label>
            <Input id="clientName" {...register('clientName')} error={!!errors.clientName} />
            {errors.clientName && <HelperText variant="error">{String(errors.clientName.message)}</HelperText>}
          </div>
          <div>
            <Label>Cliente (id opcional)</Label>
            <Input id="clientId" {...register('clientId')} error={!!errors.clientId} />
            {errors.clientId && <HelperText variant="error">{String(errors.clientId.message)}</HelperText>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Qtd</Label>
            <Input id="quantity" type="number" step="1" {...register('quantity')} error={!!errors.quantity} />
            {errors.quantity && <HelperText variant="error">{String(errors.quantity.message)}</HelperText>}
          </div>
          <div>
            <Label>Total (R$)</Label>
            <Input id="total" type="number" step="0.01" {...register('total')} error={!!errors.total} />
            {errors.total && <HelperText variant="error">{String(errors.total.message)}</HelperText>}
          </div>
          <div>
            <Label>Status</Label>
            <Select id="status" {...register('status')}>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
            </Select>
            {errors.status && <HelperText variant="error">{String(errors.status.message)}</HelperText>}
          </div>
        </div>

        <div>
          <Label>Produto</Label>
          <Input id="product" {...register('product')} error={!!errors.product} />
          {errors.product && <HelperText variant="error">{String(errors.product.message)}</HelperText>}
        </div>

        {err && <p className="text-warning text-sm">{err}</p>}
        <div className="pt-2 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 text-foreground">Cancelar</button>
          <button disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:brightness-110 disabled:opacity-50 text-foreground">
            {isSubmitting ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

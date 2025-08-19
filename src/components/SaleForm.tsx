'use client';

import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  serverTimestamp
} from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

interface FormValues {
  vendorName: string;
  region: string;
  product: string;
  quantity: number;
  total: number;
}

export default function SaleForm() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  async function onSubmit(data: FormValues) {
    setStatus('sending');
    try {
      await addDoc(collection(db, 'sales'), {
        ...data,
        vendorId: 'admin-manual', // Pode evoluir para pegar do auth
        date: serverTimestamp(),
        status: 'pago'
      });
      reset();
      setStatus('success');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-2 gap-4">
      <div>
        <input
          {...register('vendorName', { required: true })}
          placeholder="Vendedor"
          className="input w-full"
        />
        {errors.vendorName && <p className="text-red-500 text-xs mt-1">Obrigatório</p>}
      </div>

      <div>
        <input
          {...register('region', { required: true })}
          placeholder="Região"
          className="input w-full"
        />
        {errors.region && <p className="text-red-500 text-xs mt-1">Obrigatório</p>}
      </div>

      <div>
        <input
          {...register('product', { required: true })}
          placeholder="Produto"
          className="input w-full"
        />
        {errors.product && <p className="text-red-500 text-xs mt-1">Obrigatório</p>}
      </div>

      <div>
        <input
          type="number"
          {...register('quantity', { required: true, min: 1 })}
          placeholder="Quantidade"
          className="input w-full"
        />
        {errors.quantity && <p className="text-red-500 text-xs mt-1">Min. 1</p>}
      </div>

      <div className="sm:col-span-2">
        <input
          type="number"
          step="0.01"
          {...register('total', { required: true, min: 1 })}
          placeholder="Total (R$)"
          className="input w-full"
        />
        {errors.total && <p className="text-red-500 text-xs mt-1">Valor mínimo de R$ 1,00</p>}
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full bg-black text-white py-2 rounded disabled:opacity-50"
        >
          {status === 'sending' ? 'Enviando…' : 'Cadastrar'}
        </button>

        {status === 'success' && <p className="text-green-600 text-sm mt-2">Venda cadastrada!</p>}
        {status === 'error' && <p className="text-red-600 text-sm mt-2">Erro ao salvar.</p>}
      </div>
    </form>
  );
}
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useCompanyOptions } from './hooks';

interface Props {
  value: string;
  onChange: (companyId: string) => void;
}

/** Busca de restaurante (lista do super-admin). */
export function CompanyPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { data: companies, isLoading, error } = useCompanyOptions();
  const selected = companies?.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : isLoading ? 'Carregando restaurantes...' : 'Escolha um restaurante'}
          </span>
          {isLoading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar restaurante..." />
          <CommandList>
            <CommandEmpty>{error ? 'Não foi possível carregar os restaurantes.' : 'Nenhum restaurante encontrado.'}</CommandEmpty>
            <CommandGroup>
              {(companies || []).map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.id}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

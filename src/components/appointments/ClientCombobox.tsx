import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Client {
  id: string;
  first_name: string;
  last_name?: string;
  full_name?: string;
}

interface ClientComboboxProps {
  clients: Client[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ClientCombobox({ clients, value, onChange, placeholder = "Selecione um cliente..." }: ClientComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedClient = clients.find((client) => client.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedClient
            ? `${selectedClient.first_name} ${selectedClient.last_name || ''}`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente..." />
          <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
          <CommandGroup className="max-h-[200px] overflow-auto">
            {clients.map((client) => (
              <CommandItem
                key={client.id}
                value={`${client.first_name} ${client.last_name || ''} ${client.id}`}
                onSelect={() => {
                  onChange(client.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === client.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {client.first_name} {client.last_name || ''}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

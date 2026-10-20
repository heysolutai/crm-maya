'use client';

import { PartyPopper } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EventsTab } from '@/components/events/EventsTab';
import { RegistrationsTab } from '@/components/events/RegistrationsTab';

/**
 * Eventos: eventos especiais do restaurante (jantares, noites temáticas) e a
 * lista de quem quer ir. A IA conta dos eventos ligados e anota as inscrições.
 */
export default function Events() {
  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <PartyPopper className="h-7 w-7 shrink-0 text-primary" />
          Eventos
        </h1>
        <p className="mt-1 text-muted-foreground">Seus eventos especiais e quem vai em cada um.</p>
      </div>

      <Tabs defaultValue="eventos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="inscritos">Inscritos</TabsTrigger>
        </TabsList>
        <TabsContent value="eventos">
          <EventsTab />
        </TabsContent>
        <TabsContent value="inscritos">
          <RegistrationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

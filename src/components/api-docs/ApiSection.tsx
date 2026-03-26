import { ReactNode } from 'react';

interface ApiSectionProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function ApiSection({ id, title, description, children }: ApiSectionProps) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div>
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}

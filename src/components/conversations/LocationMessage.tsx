import { MapPin, ExternalLink } from 'lucide-react';

interface LocationMessageProps {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
  isClient: boolean;
}

export function LocationMessage({ 
  latitude, 
  longitude, 
  address,
  name,
  isClient 
}: LocationMessageProps) {
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=280x150&markers=color:red%7C${latitude},${longitude}&scale=2`;
  
  const displayText = name || address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  
  return (
    <a 
      href={mapsUrl} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="block max-w-[280px] group"
      aria-label="Abrir localização no Google Maps"
    >
      {/* Map Preview - usando OpenStreetMap que não precisa de API key */}
      <div className="rounded-t-lg overflow-hidden bg-muted">
        <img 
          src={`https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${longitude},${latitude}&z=15&l=map&size=280,120&pt=${longitude},${latitude},pm2rdm`}
          alt="Prévia do mapa"
          className="w-full h-[120px] object-cover"
          onError={(e) => {
            // Fallback se a imagem não carregar
            e.currentTarget.style.display = 'none';
            e.currentTarget.parentElement?.classList.add('hidden');
          }}
        />
      </div>
      
      {/* Location Info */}
      <div className={`flex items-center gap-2 p-3 rounded-b-lg transition-colors ${
        isClient 
          ? 'bg-muted hover:bg-muted/80' 
          : 'bg-white/10 hover:bg-white/20'
      }`}>
        <div className={`flex-shrink-0 p-2 rounded-full ${
          isClient ? 'bg-red-100 dark:bg-red-900/30' : 'bg-red-500/20'
        }`}>
          <MapPin className={`h-4 w-4 ${
            isClient ? 'text-red-500' : 'text-red-300'
          }`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            isClient ? 'text-foreground' : 'text-white'
          }`}>
            📍 Localização
          </p>
          <p className={`text-xs truncate ${
            isClient ? 'text-muted-foreground' : 'text-white/70'
          }`}>
            {displayText}
          </p>
        </div>
        
        <ExternalLink className={`h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
          isClient ? 'text-muted-foreground' : 'text-white/70'
        }`} />
      </div>
    </a>
  );
}

import { User, Phone, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ContactCardProps {
  name?: string;
  phone?: string;
  vcard?: string;
  isClient?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Parses vCard format to extract contact details
 */
function parseVCard(vcard: string): { name?: string; phone?: string; org?: string } {
  const result: { name?: string; phone?: string; org?: string } = {};
  
  if (!vcard) return result;
  
  // Extract name (FN or N field)
  const fnMatch = vcard.match(/FN:(.+)/i);
  if (fnMatch) {
    result.name = fnMatch[1].trim();
  } else {
    const nMatch = vcard.match(/N:([^;]+)/i);
    if (nMatch) {
      result.name = nMatch[1].trim();
    }
  }
  
  // Extract phone (TEL field)
  const telMatch = vcard.match(/TEL[^:]*:([^\n\r]+)/i);
  if (telMatch) {
    result.phone = telMatch[1].trim().replace(/[^\d+]/g, '');
  }
  
  // Extract organization
  const orgMatch = vcard.match(/ORG:(.+)/i);
  if (orgMatch) {
    result.org = orgMatch[1].trim();
  }
  
  return result;
}

export function ContactCard({ name, phone, vcard, isClient, metadata }: ContactCardProps) {
  // Try to extract from vcard if provided
  const vcardData = vcard ? parseVCard(vcard) : {};
  
  // Also check metadata for contact info
  const displayName = name || vcardData.name || metadata?.displayName || metadata?.name || 'Contato';
  const displayPhone = phone || vcardData.phone || metadata?.phone || metadata?.waid;
  const displayOrg = vcardData.org || metadata?.org;
  
  const handleOpenWhatsApp = () => {
    if (displayPhone) {
      const cleanPhone = displayPhone.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  };
  
  return (
    <div 
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg min-w-[200px] max-w-[280px]",
        isClient 
          ? "bg-white/80 border border-gray-200" 
          : "bg-white/10 border border-white/20"
      )}
    >
      {/* Avatar */}
      <div 
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
          isClient ? "bg-gray-200" : "bg-white/20"
        )}
      >
        <User className={cn(
          "h-6 w-6",
          isClient ? "text-gray-600" : "text-white/80"
        )} />
      </div>
      
      {/* Contact Info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate",
          isClient ? "text-gray-900" : "text-white"
        )}>
          {displayName}
        </p>
        
        {displayPhone && (
          <p className={cn(
            "text-xs truncate",
            isClient ? "text-gray-500" : "text-white/70"
          )}>
            <Phone className="h-3 w-3 inline mr-1" />
            {displayPhone}
          </p>
        )}
        
        {displayOrg && (
          <p className={cn(
            "text-xs truncate",
            isClient ? "text-gray-400" : "text-white/60"
          )}>
            {displayOrg}
          </p>
        )}
      </div>
      
      {/* Action Button */}
      {displayPhone && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 h-8 w-8",
            isClient 
              ? "text-green-600 hover:text-green-700 hover:bg-green-50" 
              : "text-white/90 hover:text-white hover:bg-white/20"
          )}
          onClick={handleOpenWhatsApp}
          title="Abrir no WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

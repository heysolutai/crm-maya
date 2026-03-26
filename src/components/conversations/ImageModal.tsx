import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignedMediaUrl } from "@/hooks/useSignedMediaUrl";

interface ImageModalProps {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ src, alt, isOpen, onClose }) => {
  const { signedUrl, isLoading } = useSignedMediaUrl(isOpen ? src : null);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0 bg-background/95">
        <div className="relative w-full h-full flex items-center justify-center p-4">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-10 bg-background/80 hover:bg-background"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : signedUrl ? (
            <img 
              src={signedUrl} 
              alt={alt}
              className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-lg"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

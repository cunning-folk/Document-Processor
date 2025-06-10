import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RetryButtonProps {
  onRetry: () => Promise<void>;
  disabled?: boolean;
  errorMessage?: string;
}

export function RetryButton({ onRetry, disabled, errorMessage }: RetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const { toast } = useToast();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
      toast({
        title: "Retry Successful",
        description: "Processing has been restarted.",
        variant: "default"
      });
    } catch (error: any) {
      toast({
        title: "Retry Failed",
        description: error.message || "Unable to retry processing.",
        variant: "destructive"
      });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {errorMessage && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      <Button
        onClick={handleRetry}
        disabled={disabled || isRetrying}
        variant="outline"
        size="sm"
        className="w-fit"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
        {isRetrying ? 'Retrying...' : 'Retry Processing'}
      </Button>
    </div>
  );
}
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface ProcessingStatusProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processedChunks?: number;
  totalChunks?: number;
  errorMessage?: string;
  estimatedTimeRemaining?: number;
}

export function ProcessingStatus({
  status,
  processedChunks = 0,
  totalChunks = 0,
  errorMessage,
  estimatedTimeRemaining
}: ProcessingStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const progressPercentage = totalChunks > 0 ? (processedChunks / totalChunks) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <Badge variant="secondary" className={getStatusColor()}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
        
        {totalChunks > 0 && (
          <span className="text-sm text-gray-600 font-mono">
            {processedChunks}/{totalChunks} chunks
          </span>
        )}
      </div>

      {totalChunks > 0 && (
        <div className="space-y-1">
          <Progress value={progressPercentage} className="h-2" />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{Math.round(progressPercentage)}% complete</span>
            {estimatedTimeRemaining && status === 'processing' && (
              <span>~{Math.ceil(estimatedTimeRemaining / 60)}min remaining</span>
            )}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
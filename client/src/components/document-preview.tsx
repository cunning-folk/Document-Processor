import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Eye, EyeOff, FileText, Calendar, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";


interface DocumentPreviewProps {
  document: {
    id: number;
    filename: string;
    status: string;
    processedMarkdown: string | null;
    createdAt: string;
    isEncrypted: boolean;
    expiresAt: string;
  };
  onRetry?: () => void;
}

export function DocumentPreview({ document, onRetry }: DocumentPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = async () => {
    if (!document.processedMarkdown) return;
    
    try {
      await navigator.clipboard.writeText(document.processedMarkdown);
      toast({
        title: "Copied",
        description: "Document content copied to clipboard.",
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Unable to copy to clipboard.",
        variant: "destructive"
      });
    }
  };

  const downloadMarkdown = () => {
    if (!document.processedMarkdown) return;
    
    const blob = new Blob([document.processedMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document.filename.replace(/\.[^/.]+$/, "")}.md`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Downloaded",
      description: "Markdown file downloaded successfully.",
      variant: "default"
    });
  };

  const getStatusBadge = () => {
    switch (document.status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const truncateContent = (content: string, maxLength: number = 500) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {document.filename}
            </CardTitle>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDistanceToNow(new Date(document.createdAt), { addSuffix: true })}
              </div>
              {document.isEncrypted && (
                <div className="flex items-center gap-1">
                  <Shield className="h-4 w-4" />
                  Encrypted
                </div>
              )}
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {document.status === 'completed' && document.processedMarkdown && (
          <>
            <div className="flex gap-2">
              <Button
                onClick={() => setIsExpanded(!isExpanded)}
                variant="outline"
                size="sm"
              >
                {isExpanded ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {isExpanded ? 'Hide' : 'Preview'}
              </Button>
              <Button onClick={copyToClipboard} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button onClick={downloadMarkdown} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
            
            {isExpanded && (
              <div className="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap">{document.processedMarkdown}</pre>
                </div>
              </div>
            )}
            
            {!isExpanded && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {truncateContent(document.processedMarkdown)}
                </pre>
              </div>
            )}
          </>
        )}
        
        {document.status === 'failed' && onRetry && (
          <div className="flex gap-2">
            <Button onClick={onRetry} variant="outline" size="sm">
              Retry Processing
            </Button>
          </div>
        )}
        
        {document.status === 'processing' && (
          <div className="text-sm text-blue-600">
            Document is currently being processed...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
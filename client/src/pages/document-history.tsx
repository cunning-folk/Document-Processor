import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { decryptContent, getEncryptionKey } from "@/lib/encryption";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Download, FileText, Clock, AlertCircle, CheckCircle, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: number;
  filename: string;
  status: string;
  totalChunks: number | null;
  processedChunks: number | null;
  createdAt: string;
  processedMarkdown: string | null;
  errorMessage: string | null;
  isEncrypted: boolean;
  expiresAt: string;
}

interface DocumentHistoryResponse {
  documents: Document[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export default function DocumentHistory() {
  const [currentPage, setCurrentPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/documents", currentPage],
    queryFn: async (): Promise<DocumentHistoryResponse> => {
      const response = await fetch(`/api/documents?page=${currentPage}&limit=10`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    refetchInterval: 2000, // Refetch every 2 seconds for real-time updates
    refetchIntervalInBackground: true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error('Failed to delete document');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
  });

  const handleDownload = async (documentId: number, filename: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/download`);
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      let content = await response.text();
      
      // Get document to check encryption status
      const docResponse = await fetch(`/api/documents/${documentId}`);
      const document = await docResponse.json();
      
      // Check if document is encrypted and decrypt if needed
      if (document.isEncrypted) {
        const encryptionKey = getEncryptionKey(documentId);
        if (!encryptionKey) {
          toast({
            title: "Encryption Key Missing",
            description: "Cannot decrypt document. The encryption key was not found in session storage.",
            variant: "destructive",
          });
          return;
        }
        
        try {
          content = decryptContent(content, encryptionKey);
        } catch (error) {
          toast({
            title: "Decryption Failed",
            description: "Unable to decrypt document content. The encryption key may be invalid.",
            variant: "destructive",
          });
          return;
        }
      }
      
      // Create blob from decrypted content
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const originalName = filename.replace(/\.[^/.]+$/, "");
      a.href = url;
      a.download = `${originalName}_processed.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      processing: "secondary",
      failed: "destructive",
      pending: "outline"
    };
    
    return (
      <Badge variant={variants[status] || "outline"} className="flex items-center gap-1">
        {getStatusIcon(status)}
        {status}
      </Badge>
    );
  };

  const getProgressText = (doc: Document) => {
    if (doc.status === 'processing' && doc.totalChunks && doc.processedChunks !== null) {
      return `${doc.processedChunks}/${doc.totalChunks} chunks processed`;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Document History</h1>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Document History</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-500">Failed to load document history. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 px-4 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Document History</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {data?.pagination.totalCount || 0} documents total
        </p>
      </div>

      {data?.documents.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No documents found. Upload a document to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {data?.documents.map((doc, index) => (
              <Card key={doc.id} className={`animate-in slide-in-from-bottom-2 duration-500 hover:shadow-lg transition-all hover:scale-[1.02] border-l-4 ${
                doc.status === 'completed' ? 'border-l-green-500' : 
                doc.status === 'processing' ? 'border-l-blue-500' : 
                doc.status === 'failed' ? 'border-l-red-500' : 'border-l-gray-300'
              }`} style={{ animationDelay: `${index * 100}ms` }}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base sm:text-lg truncate">{doc.filename}</CardTitle>
                        {doc.isEncrypted && (
                          <div className="relative animate-in zoom-in-75 duration-300 delay-300">
                            <Shield className="h-4 w-4 text-green-600 animate-pulse" />
                          </div>
                        )}
                      </div>
                      <CardDescription className="text-xs sm:text-sm space-y-1">
                        <div>Uploaded {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}</div>
                        <div className="text-orange-600">
                          Auto-deletes {formatDistanceToNow(new Date(doc.expiresAt), { addSuffix: true })} for privacy
                        </div>
                      </CardDescription>
                    </div>
                    <div className="flex items-center">
                      {getStatusBadge(doc.status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex-1">
                      {getProgressText(doc) && (
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {getProgressText(doc)}
                        </p>
                      )}
                      {doc.status === 'failed' && doc.errorMessage && (
                        <p className="text-xs sm:text-sm text-red-500">
                          Error: {doc.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {doc.status === 'completed' && doc.processedMarkdown && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(doc.id, doc.filename)}
                          className="flex-1 sm:flex-none transition-all duration-200 hover:scale-105 hover:shadow-md bg-green-50 hover:bg-green-100 animate-in slide-in-from-bottom-2 duration-300 delay-500"
                        >
                          <Download className="h-4 w-4 mr-2 transition-transform duration-200 hover:translate-y-0.5" />
                          Download
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deleteMutation.isPending}
                        className="flex-1 sm:flex-none transition-all duration-200 hover:scale-105 hover:shadow-md hover:bg-red-50 hover:border-red-200 hover:text-red-600 animate-in slide-in-from-bottom-2 duration-300 delay-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2 transition-transform duration-200 hover:rotate-12" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {data && data.pagination.totalPages > 1 && (
            <div className="flex justify-center mt-8 gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 py-2 text-sm">
                Page {currentPage} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, data.pagination.totalPages))}
                disabled={currentPage === data.pagination.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
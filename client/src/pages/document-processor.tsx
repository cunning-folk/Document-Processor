import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { MarkdownEditor } from "@/components/markdown-editor";
import { PrivacyNotice } from "@/components/privacy-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  generateEncryptionKey, 
  encryptContent, 
  decryptContent, 
  hashFilename, 
  storeEncryptionKey,
  getEncryptionKey
} from "@/lib/encryption";
import { 
  FileText, 
  Settings, 
  Upload, 
  Wand2, 
  Eye, 
  EyeOff, 
  Loader2, 
  CheckCircle,
  AlertTriangle,
  Copy,
  Download
} from "lucide-react";

interface ProcessingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed';
}

export default function DocumentProcessor() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [processedMarkdown, setProcessedMarkdown] = useState("");
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: "extract", label: "Encrypting document content...", status: "pending" },
    { id: "chunk", label: "Preparing secure upload...", status: "pending" },
    { id: "openai", label: "Processing with AI (encrypted)...", status: "pending" },
    { id: "format", label: "Finalizing secure processing...", status: "pending" }
  ]);

  const { toast } = useToast();

  const processDocumentMutation = useMutation({
    mutationFn: async (data: { file: File; apiKey: string; assistantId: string }) => {
      // Generate encryption key for this document
      const encryptionKey = generateEncryptionKey();
      
      // Read file content
      const fileContent = await data.file.text();
      
      // Encrypt the content before upload
      updateProcessingStep("extract", "active");
      const encryptedContent = encryptContent(fileContent, encryptionKey);
      const hashedFilename = hashFilename(data.file.name, encryptionKey);
      updateProcessingStep("extract", "completed");
      
      // Create encrypted file blob
      const encryptedBlob = new Blob([encryptedContent], { type: 'text/plain' });
      const encryptedFile = new File([encryptedBlob], hashedFilename, { type: 'text/plain' });
      
      const formData = new FormData();
      formData.append("file", encryptedFile);
      formData.append("apiKey", data.apiKey);
      formData.append("assistantId", data.assistantId);
      formData.append("isEncrypted", "true"); // Flag for server

      updateProcessingStep("chunk", "active");
      await new Promise(resolve => setTimeout(resolve, 500));
      updateProcessingStep("chunk", "completed");
      
      updateProcessingStep("openai", "active");
      
      const response = await apiRequest("POST", "/api/process-document", formData);
      const result = await response.json();
      
      // Store encryption key for later decryption
      storeEncryptionKey(result.id, encryptionKey);
      
      updateProcessingStep("openai", "completed");
      updateProcessingStep("format", "active");
      await new Promise(resolve => setTimeout(resolve, 500));
      updateProcessingStep("format", "completed");
      
      return result;
    },
    onSuccess: (data) => {
      setProcessedMarkdown(data.processedMarkdown);
      toast({
        title: "Success!",
        description: "Document processed successfully",
      });
      resetProcessingSteps();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process document",
        variant: "destructive",
      });
      resetProcessingSteps();
    }
  });

  const updateProcessingStep = (stepId: string, status: 'pending' | 'active' | 'completed') => {
    setProcessingSteps(prev => 
      prev.map(step => 
        step.id === stepId ? { ...step, status } : step
      )
    );
  };

  const resetProcessingSteps = () => {
    setProcessingSteps(prev => 
      prev.map(step => ({ ...step, status: 'pending' as const }))
    );
  };

  const handleProcessDocument = () => {
    if (!uploadedFile) {
      toast({
        title: "File Required",
        description: "Please upload a file first",
        variant: "destructive",
      });
      return;
    }

    processDocumentMutation.mutate({
      file: uploadedFile,
      apiKey: "", // Will be handled by server environment variables
      assistantId: "asst_OqSPqevzweqfm85VGKcJuNPF"
    });
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(processedMarkdown);
      toast({
        title: "Copied!",
        description: "Markdown content copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([processedMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${uploadedFile?.name.replace(/\.[^/.]+$/, "") || "document"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Downloaded!",
      description: "Markdown file downloaded successfully",
    });
  };

  const getStepIcon = (status: ProcessingStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'active':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-300" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">


        {/* File Upload */}
        <Card className="mb-6 sm:mb-8">
          <CardContent className="pt-6">
            <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <Upload className="text-primary mr-2 h-4 w-4 sm:h-5 sm:w-5" />
              Upload Document
            </h2>
            
            <FileUpload
              onFileSelect={setUploadedFile}
              selectedFile={uploadedFile}
              disabled={processDocumentMutation.isPending}
            />
          </CardContent>
        </Card>

        {/* Process Button */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <Button
            onClick={handleProcessDocument}
            disabled={processDocumentMutation.isPending}
            size="lg"
            className="w-full sm:w-auto px-6 sm:px-8 py-3"
          >
            {processDocumentMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {processDocumentMutation.isPending ? "Processing..." : "Process Document"}
          </Button>
        </div>

        {/* Processing Status */}
        {processDocumentMutation.isPending && (
          <Alert className="mb-8 border-blue-200 bg-blue-50">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <AlertDescription>
              <div className="mb-4">
                <h3 className="font-semibold text-blue-900">Processing Document</h3>
              </div>
              <div className="space-y-3">
                {processingSteps.map((step) => (
                  <div key={step.id} className="flex items-center space-x-3">
                    {getStepIcon(step.status)}
                    <span className={`text-sm ${
                      step.status === 'completed' ? 'text-green-800' :
                      step.status === 'active' ? 'text-blue-800' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {processedMarkdown && (
          <Card>
            <div className="border-b border-gray-200 px-4 sm:px-6 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-base sm:text-lg font-semibold text-slate-800 flex items-center">
                  <FileText className="text-green-500 mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                  Processed Result
                </h2>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToClipboard}
                    className="flex-1 sm:flex-none"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </div>
            
            <MarkdownEditor 
              value={processedMarkdown}
              onChange={setProcessedMarkdown}
            />
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center text-sm text-slate-500">
            <p>Built with modern web technologies • OpenAI Assistants API integration</p>
            <p className="mt-2">Your API keys are handled securely and never stored</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

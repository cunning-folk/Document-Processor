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
  const [directText, setDirectText] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [processedMarkdown, setProcessedMarkdown] = useState("");
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: "extract", label: "🔐 Encrypting document content...", status: "pending" },
    { id: "chunk", label: "📦 Preparing secure upload...", status: "pending" },
    { id: "openai", label: "🤖 Processing with AI (encrypted)...", status: "pending" },
    { id: "format", label: "✨ Finalizing secure processing...", status: "pending" }
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
      const errorMessage = error.message || "Failed to process document";
      
      // Show more helpful error messages for common issues
      if (errorMessage.includes('encrypted during upload')) {
        toast({
          title: "Upload Encryption Detected",
          description: errorMessage.replace('This file appears to be encrypted during upload. This usually happens due to browser extensions or security software. Please try:', 'Try these solutions:'),
          variant: "destructive",
        });
      } else if (errorMessage.includes('Unable to detect PDF format')) {
        toast({
          title: "Invalid PDF File",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Processing Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
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
    if (inputMode === 'file' && !uploadedFile) {
      toast({
        title: "File Required",
        description: "Please upload a file first",
        variant: "destructive",
      });
      return;
    }

    if (inputMode === 'text' && !directText.trim()) {
      toast({
        title: "Text Required",
        description: "Please enter some text to process",
        variant: "destructive",
      });
      return;
    }

    if (inputMode === 'file') {
      processDocumentMutation.mutate({
        file: uploadedFile!,
        apiKey: "", // Will be handled by server environment variables
        assistantId: "asst_OqSPqevzweqfm85VGKcJuNPF"
      });
    } else {
      // For text input, create a simple text file
      const textFile = new File([directText], 'direct-input.txt', { type: 'text/plain' });
      processDocumentMutation.mutate({
        file: textFile,
        apiKey: "", // Will be handled by server environment variables
        assistantId: "asst_OqSPqevzweqfm85VGKcJuNPF"
      });
    }
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

  const getStepIcon = (status: ProcessingStep['status'], index: number) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500 animate-in zoom-in-75 duration-300" />;
      case 'active':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      default:
        return <div className={`w-4 h-4 rounded-full bg-gray-300 animate-in fade-in duration-300`} 
                    style={{ animationDelay: `${index * 150}ms` }} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">

        {/* Privacy Notice */}
        <PrivacyNotice />

        {/* Input Mode Toggle */}
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4 mb-4">
              <button
                onClick={() => setInputMode('file')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  inputMode === 'file' 
                    ? 'bg-primary text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                File Upload
              </button>
              <button
                onClick={() => setInputMode('text')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  inputMode === 'text' 
                    ? 'bg-primary text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Direct Text Input
              </button>
            </div>
          </CardContent>
        </Card>

        {/* File Upload */}
        {inputMode === 'file' && (
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
            
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Troubleshooting PDF Uploads</h3>
              <div className="space-y-2 text-xs text-blue-800">
                <p>If uploads fail, try these solutions:</p>
                <ul className="ml-4 space-y-1 list-disc">
                  <li>Download and test with our sample PDF first</li>
                  <li>Disable browser extensions temporarily</li>
                  <li>Use incognito/private browsing mode</li>
                  <li>Try a different browser or network</li>
                </ul>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('/api/test-pdf', '_blank')}
                className="mt-3 text-blue-700 border-blue-300 hover:bg-blue-100"
              >
                <Download className="mr-2 h-3 w-3" />
                Download Test PDF
              </Button>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Direct Text Input */}
        {inputMode === 'text' && (
          <Card className="mb-6 sm:mb-8">
            <CardContent className="pt-6">
              <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-4 flex items-center">
                <FileText className="text-primary mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Direct Text Input
              </h2>
              
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-medium text-blue-900 mb-2">For PDF Files:</h3>
                <div className="text-xs text-blue-800 space-y-2">
                  <p>If you have a PDF that won't upload due to encryption, extract the text locally first:</p>
                  <div className="bg-blue-100 p-2 rounded font-mono text-xs">
                    python extract-pdf-text.py your-document.pdf
                  </div>
                  <p>Then copy the extracted text from the generated _extracted.txt file and paste it below.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('/extract-pdf-text.py', '_blank')}
                  className="mt-3 text-blue-700 border-blue-300 hover:bg-blue-100"
                >
                  <Download className="mr-2 h-3 w-3" />
                  Download PDF Extractor
                </Button>
              </div>
              
              <textarea
                value={directText}
                onChange={(e) => setDirectText(e.target.value)}
                placeholder="Paste your document text here..."
                className="w-full h-40 p-3 border border-gray-300 rounded-lg resize-vertical"
                disabled={processDocumentMutation.isPending}
              />
            </CardContent>
          </Card>
        )}

        {/* Process Button */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <Button
            onClick={handleProcessDocument}
            disabled={(inputMode === 'file' ? !uploadedFile : !directText.trim()) || processDocumentMutation.isPending}
            size="lg"
            className="w-full sm:w-auto px-6 sm:px-8 py-3 transition-all duration-300 hover:scale-105 hover:shadow-lg disabled:hover:scale-100 disabled:hover:shadow-none animate-in zoom-in-95 duration-500 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {processDocumentMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4 transition-transform duration-300 hover:rotate-12" />
            )}
            {processDocumentMutation.isPending ? "✨ Processing Magic..." : "🪄 Process Document"}
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
                {processingSteps.map((step, index) => (
                  <div key={step.id} className={`flex items-center space-x-3 animate-in slide-in-from-left-2 duration-500`} 
                       style={{ animationDelay: `${index * 200}ms` }}>
                    {getStepIcon(step.status, index)}
                    <span className={`text-sm transition-all duration-300 ${
                      step.status === 'completed' ? 'text-green-800 font-medium' :
                      step.status === 'active' ? 'text-blue-800 font-medium animate-pulse' : 'text-gray-500'
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
          <Card className="animate-in slide-in-from-bottom-4 duration-700 shadow-lg border-green-200">
            <div className="border-b border-gray-200 px-4 sm:px-6 py-4 bg-gradient-to-r from-green-50 to-blue-50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-base sm:text-lg font-semibold text-slate-800 flex items-center animate-in slide-in-from-left-2 duration-500">
                  <FileText className="text-green-500 mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-pulse" />
                  ✨ Processed Result
                </h2>
                <div className="flex items-center space-x-2 animate-in slide-in-from-right-2 duration-500 delay-200">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToClipboard}
                    className="flex-1 sm:flex-none transition-all duration-200 hover:scale-105 hover:shadow-md"
                  >
                    <Copy className="h-4 w-4 mr-2 transition-transform duration-200 hover:rotate-12" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="flex-1 sm:flex-none transition-all duration-200 hover:scale-105 hover:shadow-md bg-green-50 hover:bg-green-100"
                  >
                    <Download className="h-4 w-4 mr-2 transition-transform duration-200 hover:translate-y-0.5" />
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

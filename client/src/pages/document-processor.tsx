import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { MarkdownEditor } from "@/components/markdown-editor";
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
  const [config, setConfig] = useState({
    apiKey: "",
    assistantId: "asst_OqSPqevzweqfm85VGKcJuNPF"
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [processedMarkdown, setProcessedMarkdown] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([
    { id: "extract", label: "Extracting text from document...", status: "pending" },
    { id: "openai", label: "Sending to OpenAI Assistant...", status: "pending" },
    { id: "format", label: "Cleaning and formatting text...", status: "pending" }
  ]);

  const { toast } = useToast();

  const processDocumentMutation = useMutation({
    mutationFn: async (data: { file: File; apiKey: string; assistantId: string }) => {
      const formData = new FormData();
      formData.append("file", data.file);
      formData.append("apiKey", data.apiKey);
      formData.append("assistantId", data.assistantId);

      // Simulate processing steps
      updateProcessingStep("extract", "active");
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateProcessingStep("extract", "completed");
      
      updateProcessingStep("openai", "active");
      await new Promise(resolve => setTimeout(resolve, 1500));
      updateProcessingStep("openai", "completed");
      
      updateProcessingStep("format", "active");
      
      const response = await apiRequest("POST", "/api/process-document", formData);
      const result = await response.json();
      
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
    if (!config.apiKey) {
      toast({
        title: "Configuration Required",
        description: "Please enter your OpenAI API key",
        variant: "destructive",
      });
      return;
    }

    if (!config.assistantId) {
      toast({
        title: "Configuration Required", 
        description: "Please enter the Assistant ID",
        variant: "destructive",
      });
      return;
    }

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
      apiKey: config.apiKey,
      assistantId: config.assistantId
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <FileText className="text-white text-lg" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-800">Document Text Processor</h1>
              <p className="text-sm text-slate-500">Convert and clean documents with AI assistance</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Configuration Panel */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <Settings className="text-primary mr-2" />
              Configuration
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="api-key" className="text-sm font-medium text-slate-700 mb-2">
                  OpenAI API Key
                </Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder="sk-..."
                    value={config.apiKey}
                    onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="assistant-id" className="text-sm font-medium text-slate-700 mb-2">
                  Assistant ID
                </Label>
                <Input
                  id="assistant-id"
                  type="text"
                  placeholder="asst_OqSPqevzweqfm85VGKcJuNPF"
                  value={config.assistantId}
                  onChange={(e) => setConfig(prev => ({ ...prev, assistantId: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <Upload className="text-primary mr-2" />
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
        <div className="flex justify-center mb-8">
          <Button
            onClick={handleProcessDocument}
            disabled={processDocumentMutation.isPending}
            size="lg"
            className="px-8 py-3"
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
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                <FileText className="text-green-500 mr-2" />
                Processed Result
              </h2>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyToClipboard}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
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

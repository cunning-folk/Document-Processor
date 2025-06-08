import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, Copy, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DocumentUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const { toast } = useToast();

  const processMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsPolling(false);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assistantId', 'asst_OqSPqevzweqfm85VGKcJuNPF');

      const response = await fetch('/api/process-document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Processing failed');
      }

      const data = await response.json();
      setIsPolling(true);
      
      const pollResult = async (id: number): Promise<any> => {
        const pollResponse = await fetch(`/api/documents/${id}`);
        const doc = await pollResponse.json();
        
        if (doc.status === 'completed') {
          setIsPolling(false);
          return doc;
        } else if (doc.status === 'failed') {
          setIsPolling(false);
          throw new Error(doc.errorMessage || 'Processing failed');
        } else {
          if (doc.totalChunks && doc.processedChunks) {
            const progress = Math.round((doc.processedChunks / doc.totalChunks) * 100);
            toast({
              title: "Processing...",
              description: `Progress: ${progress}% (${doc.processedChunks}/${doc.totalChunks} chunks)`,
            });
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          return pollResult(id);
        }
      };

      return pollResult(data.id);
    },
    onSuccess: (data) => {
      setResult(data.processedMarkdown);
      toast({
        title: "Processing Complete",
        description: "Your document has been processed successfully."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing Failed", 
        description: error.message.includes('encrypted') 
          ? "File appears encrypted. Try a different browser or disable extensions."
          : error.message,
        variant: "destructive"
      });
    }
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    const allowedTypes = ['pdf', 'txt', 'md'];
    const fileExtension = file.name.toLowerCase().split('.').pop();
    
    if (!allowedTypes.includes(fileExtension || '')) {
      toast({
        title: "Invalid File Type",
        description: "Please select a PDF, TXT, or MD file.",
        variant: "destructive"
      });
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 50MB.",
        variant: "destructive"
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleProcess = () => {
    if (!selectedFile) return;
    processMutation.mutate(selectedFile);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full mb-6">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            Document Processor
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Transform your documents with AI-powered formatting. Upload PDF, TXT, or MD files and get beautifully structured content.
          </p>
        </div>

        {/* Upload Area */}
        <Card className="mb-8 shadow-xl border-0 overflow-hidden">
          <CardContent className="pt-8">
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                dragActive 
                  ? 'border-blue-400 bg-blue-50 scale-105' 
                  : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <CheckCircle2 className="h-16 w-16 text-green-500" />
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <FileText className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-gray-900 mb-2">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready to process
                    </p>
                  </div>
                  <div className="flex gap-4 justify-center">
                    <Button
                      onClick={handleProcess}
                      disabled={processMutation.isPending}
                      className="min-w-36 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      size="lg"
                    >
                      {processMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isPolling ? 'Processing...' : 'Uploading...'}
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Process Document
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedFile(null)}
                      disabled={processMutation.isPending}
                      size="lg"
                    >
                      Choose Different File
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-center">
                    <Upload className="h-16 w-16 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900 mb-3">
                      Drop your document here
                    </p>
                    <p className="text-gray-500 mb-6">
                      or click to browse files
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload">
                      <Button variant="outline" size="lg" asChild>
                        <span>Choose File</span>
                      </Button>
                    </label>
                  </div>
                  <p className="text-sm text-gray-400">
                    Supports PDF, TXT, and MD files up to 50MB
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card className="mb-8 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-4">
              <AlertCircle className="h-6 w-6 text-amber-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 mb-3 text-lg">
                  Having upload issues?
                </h3>
                <div className="text-amber-800 space-y-2">
                  <p className="flex items-center">
                    <span className="w-2 h-2 bg-amber-600 rounded-full mr-3"></span>
                    Try using a different browser or incognito mode
                  </p>
                  <p className="flex items-center">
                    <span className="w-2 h-2 bg-amber-600 rounded-full mr-3"></span>
                    Temporarily disable browser extensions
                  </p>
                  <p className="flex items-center">
                    <span className="w-2 h-2 bg-amber-600 rounded-full mr-3"></span>
                    Check if the PDF is password-protected
                  </p>
                  <p className="flex items-center">
                    <span className="w-2 h-2 bg-amber-600 rounded-full mr-3"></span>
                    Try uploading from a different network
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <Card className="shadow-xl border-0">
            <CardContent className="pt-8">
              <div className="flex items-center mb-6">
                <CheckCircle2 className="h-6 w-6 text-green-500 mr-3" />
                <h2 className="text-2xl font-bold text-gray-900">
                  Processed Content
                </h2>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl max-h-96 overflow-y-auto border">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
                  {result}
                </pre>
              </div>
              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(result)}
                  className="flex-1"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to Clipboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([result], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'processed-document.md';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download as Markdown
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
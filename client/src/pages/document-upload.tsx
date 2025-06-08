import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, Copy, Download, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DocumentUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showDropAnimation, setShowDropAnimation] = useState(false);
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
    
    if (e.type === "dragenter") {
      setDragCounter(prev => prev + 1);
      setDragActive(true);
    } else if (e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragCounter(prev => prev - 1);
      if (dragCounter <= 1) {
        setDragActive(false);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setDragCounter(0);
    setShowDropAnimation(true);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      // Smooth drop animation
      setTimeout(() => {
        handleFileSelect(files[0]);
        setShowDropAnimation(false);
      }, 300);
    } else {
      setShowDropAnimation(false);
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
          <h1 className="text-3xl font-display font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">
            Document Processor
          </h1>
          <p className="text-sm font-body text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Transform your documents with AI-powered formatting. Upload PDF, TXT, or MD files and get beautifully structured content.
          </p>
        </div>

        {/* Upload Area */}
        <Card className="mb-8 shadow-xl border-0 overflow-hidden">
          <CardContent className="pt-8">
            <div
              className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-500 ease-out ${
                dragActive 
                  ? 'border-blue-500 bg-gradient-to-br from-blue-50 via-blue-100 to-purple-50 scale-105 shadow-2xl transform rotate-1' 
                  : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50 hover:scale-102 hover:shadow-lg'
              } ${
                showDropAnimation 
                  ? 'animate-pulse border-green-500 bg-green-50' 
                  : ''
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {/* Floating particles animation when dragging */}
              {dragActive && (
                <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                  <div className="absolute top-4 left-4 w-2 h-2 bg-blue-400 rounded-full animate-bounce opacity-60"></div>
                  <div className="absolute top-8 right-8 w-1 h-1 bg-purple-400 rounded-full animate-ping opacity-40"></div>
                  <div className="absolute bottom-6 left-12 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse opacity-50"></div>
                  <div className="absolute bottom-12 right-6 w-1 h-1 bg-purple-500 rounded-full animate-bounce opacity-30 animation-delay-200"></div>
                  <div className="absolute top-1/2 left-6 w-1 h-1 bg-blue-300 rounded-full animate-ping opacity-60 animation-delay-500"></div>
                  <div className="absolute top-1/3 right-12 w-2 h-2 bg-purple-300 rounded-full animate-pulse opacity-40 animation-delay-700"></div>
                </div>
              )}

              {/* Ripple effect on drop */}
              {showDropAnimation && (
                <div className="absolute inset-0 rounded-xl pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-0 h-0 bg-green-400 rounded-full animate-ripple opacity-30"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-0 h-0 bg-green-300 rounded-full animate-ripple opacity-20 animation-delay-200"></div>
                </div>
              )}
              {selectedFile ? (
                <div className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-center">
                    <div className="relative group">
                      <div className="absolute -inset-2 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full opacity-30 group-hover:opacity-50 transition-opacity animate-pulse"></div>
                      <CheckCircle2 className="relative h-16 w-16 text-green-500 transform group-hover:scale-110 transition-transform duration-300" />
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center animate-bounce">
                        <FileText className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <p className="text-lg font-body font-medium text-gray-900 mb-1 break-words">{selectedFile.name}</p>
                    <p className="text-xs font-mono text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready to process
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                      className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
                      disabled={processMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex gap-4 justify-center">
                    <Button
                      onClick={handleProcess}
                      disabled={processMutation.isPending}
                      className="min-w-32 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-sm font-body"
                      size="default"
                    >
                      {processMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          {isPolling ? 'Processing...' : 'Uploading...'}
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-3 w-3" />
                          Process Document
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedFile(null)}
                      disabled={processMutation.isPending}
                      size="default"
                      className="text-sm font-body"
                    >
                      Choose Different File
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 relative z-10">
                  <div className="flex items-center justify-center">
                    <div className={`transition-all duration-300 ${dragActive ? 'animate-float scale-125' : 'hover:scale-110'}`}>
                      <Upload className={`h-16 w-16 transition-colors duration-300 ${dragActive ? 'text-blue-500' : 'text-gray-400 hover:text-blue-400'}`} />
                      {dragActive && (
                        <div className="absolute inset-0 rounded-full animate-shimmer"></div>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className={`text-lg font-body font-medium mb-2 transition-all duration-300 ${dragActive ? 'text-blue-600 scale-105' : 'text-gray-900'}`}>
                      {dragActive ? 'Release to upload' : 'Drop your document here'}
                    </p>
                    <p className={`text-sm font-body mb-4 transition-colors duration-300 ${dragActive ? 'text-blue-500' : 'text-gray-500'}`}>
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
                      <Button 
                        variant="outline" 
                        size="default" 
                        asChild
                        className={`text-sm font-body transition-all duration-300 hover:scale-105 hover:shadow-md ${dragActive ? 'border-blue-400 text-blue-600 bg-blue-50' : ''}`}
                      >
                        <span>Choose File</span>
                      </Button>
                    </label>
                  </div>
                  <p className="text-xs font-mono text-gray-400">
                    Supports PDF, TXT, and MD files up to 50MB
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card className="mb-8 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-lg">
          <CardContent className="pt-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-body font-medium text-amber-900 mb-2 text-sm">
                  Having upload issues?
                </h3>
                <div className="text-amber-800 space-y-1">
                  <p className="flex items-center text-xs font-body">
                    <span className="w-1.5 h-1.5 bg-amber-600 rounded-full mr-2"></span>
                    Try using a different browser or incognito mode
                  </p>
                  <p className="flex items-center text-xs font-body">
                    <span className="w-1.5 h-1.5 bg-amber-600 rounded-full mr-2"></span>
                    Temporarily disable browser extensions
                  </p>
                  <p className="flex items-center text-xs font-body">
                    <span className="w-1.5 h-1.5 bg-amber-600 rounded-full mr-2"></span>
                    Check if the PDF is password-protected
                  </p>
                  <p className="flex items-center text-xs font-body">
                    <span className="w-1.5 h-1.5 bg-amber-600 rounded-full mr-2"></span>
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
            <CardContent className="pt-6">
              <div className="flex items-center mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                <h2 className="text-lg font-display font-medium text-gray-900">
                  Processed Content
                </h2>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-xl max-h-80 overflow-y-auto border">
                <pre className="whitespace-pre-wrap text-xs text-gray-800 font-mono leading-relaxed">
                  {result}
                </pre>
              </div>
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(result)}
                  className="flex-1 text-sm font-body"
                  size="sm"
                >
                  <Copy className="mr-2 h-3 w-3" />
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
                  className="flex-1 text-sm font-body"
                  size="sm"
                >
                  <Download className="mr-2 h-3 w-3" />
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
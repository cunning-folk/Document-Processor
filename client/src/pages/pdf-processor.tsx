import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PDFProcessor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

  const processMutation = useMutation({
    mutationFn: async (file: File) => {
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
      
      // Poll for completion
      const pollResult = async (id: number): Promise<any> => {
        const pollResponse = await fetch(`/api/documents/${id}`);
        const doc = await pollResponse.json();
        
        if (doc.status === 'completed') {
          return doc;
        } else if (doc.status === 'failed') {
          throw new Error(doc.errorMessage || 'Processing failed');
        } else {
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
        description: "Your PDF has been processed successfully."
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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-800 mb-3">
          Document Processor
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Upload your PDF, TXT, or MD file and get clean, formatted text output powered by AI.
        </p>
      </div>

      {/* Upload Area */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <FileText className="h-12 w-12 text-green-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={handleProcess}
                    disabled={processMutation.isPending}
                    className="min-w-32"
                  >
                    {processMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Process PDF"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedFile(null)}
                    disabled={processMutation.isPending}
                  >
                    Choose Different File
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <Upload className="h-12 w-12 text-gray-400" />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    Drop your PDF here
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    or click to browse files
                  </p>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button variant="outline" asChild>
                      <span>Choose File</span>
                    </Button>
                  </label>
                </div>
                <p className="text-xs text-gray-400">
                  Supports PDF files up to 50MB
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-amber-900 mb-2">
                Having upload issues?
              </h3>
              <div className="text-sm text-amber-800 space-y-1">
                <p>• Try using a different browser or incognito mode</p>
                <p>• Temporarily disable browser extensions</p>
                <p>• Check if the PDF is password-protected</p>
                <p>• Try uploading from a different network</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Processed Content
            </h2>
            <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-800">
                {result}
              </pre>
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(result)}
              >
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
              >
                Download as Markdown
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}